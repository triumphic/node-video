/*路由*/
module.exports = function (router) {
    var childProcess = require('child_process');
    var path = require('path');
    var fs = require('fs');
    var os = require('os');
    var asyncT = require('async');
    var net = require('net');
    var request = require('public_nodejs/request');
    // var multer = require("public_nodejs/koa-multer"); //文件上传
    // var restClient = require('common/request');
    // var multer = require('public_nodejs/multer');
    var defaultDir = 'public/video';
    var sourceVideoDir = 'source';
    var alarmVideoDir = 'alarm';

    //router.all('*', function (req, res, next) {
    //  res.header("Access-Control-Allow-Origin", "*");
    //next();
    //});


    function isExistsSyncDir(path) {
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    }

    //推送端告知请求token的值
    router.post('/vidtk', (req, res, next) => {
        var spToken = req.body.spt || '';       //视频流的token  和浏览器端协商好的值
        var reqToken = req.body.rqt || '';      //请求的的鉴权token，由token服务统一分配
        if (!spToken || !reqToken)
            return res.send({
                p: 0    //非法访问
            });
        request({
            har: {
                url: _config.tokenServiceUrl + 'check_token',
                method: 'POST',
                headers: [{
                    name: 'content-type',
                    value: 'application/json'
                }, {
                    name: 'Authorization',
                    value: reqToken
                }],
                postData: {
                    mimeType: 'application/json',
                    text: '{}'
                }
            }
        }, function (err, httpResponse, body) {
            if (err) {
                console.error('验证token时错误');
                console.error(err.stack || err);
                return res.send({
                    p: 1    //程序异常
                });
            }

            if (httpResponse && httpResponse.statusCode != 200) {
                console.error('验证token时连接后台服务异常');
                console.error(body);
                return res.send({
                    p: 1    //程序异常
                });
            }

            var responseObj = {};
            try {
                responseObj = typeof body == 'object' ? body : JSON.parse(body);
            } catch (e) {
                responseObj = {};
            } finally {
                if (responseObj.result != '0')
                    return res.send({
                        p: 2    //验证失败
                    });
                global._reqTokenObj = global._reqTokenObj || {};
                global._reqTokenObj[spToken] = reqToken;
                res.send({
                    p: 3    //验证成功
                });
            }
        });
    });

    // //查看视频---获取实时播放地址
    // router.post('/playhls', (req, res, next) => {
    //     var token = req.body.token || '';
    //     if (!token)
    //         return res.send({
    //             p: 0    //非法访问
    //         });
    //     global.liveInfoObj = global.liveInfoObj || {};
    //     var currTokenUseingTime = (global.liveInfoObj[token] || {}).time;
    //     if (!currTokenUseingTime)
    //         return res.send( {
    //             p: 2    //没有对应的播放流
    //         });
    //     var url = _config.accessDomin + token + '/' + currTokenUseingTime + '/playlist.m3u8';
    //     res.send( {
    //         p: 1,
    //         url: url
    //     });
    // });

    //查看视频---获取实时播放地址--地址中不带时间
    router.post('/playhls', (req, res, next) => {
        var token = req.body.token || '';
        if (!token)
            return res.send({
                p: 0    //非法访问
            });
        var url = _config.accessDomin + 'rt/' + token + '/playlist.m3u8';
        res.send({
            p: 1,
            url: url
        });
    });

    //查看视频---实时播放---请求中不带时间
    router.get('/rt/:token/:fname', async function (req, res, next) {
        var token = req.params.token;
        // var useIngTime = req.params.time;
        var fileName = req.params.fname;

        // console.error('--------------------收到播放请求，token：' + token + '，fileName：' + fileName);
        if (!token || !fileName) {
            // console.error('-------------------非法请求');
            return res.send(405, '非法访问');
        }
        if (fileName.indexOf('.js') > -1 || fileName.indexOf('.css') > -1) return next();

        var videoCacheDir = await getCanUseCacheDir(token);
        if (!videoCacheDir) {
            console.error('----------------------------' + token + '的视频文件不存在');
            return res.send(404, '没有视频文件');
        }
        var sourceVideoCacheDir = path.join(videoCacheDir, sourceVideoDir);

        var currTokenUseingTime;
        var dateTime = 0;
        var filesArr = fs.readdirSync(sourceVideoCacheDir);
        for (var i = 0; i < filesArr.length; i++) {
            var _currStr = filesArr[i];
            var _timeStr = getDateByStr(_currStr);
            var _date = new Date(_timeStr);
            if (_date == 'Invalid Date') continue;
            if (_date.getTime() > dateTime) {
                currTokenUseingTime = _currStr;
                dateTime = _date.getTime();
            }
        }

        sourceVideoCacheDir = path.join(sourceVideoCacheDir, currTokenUseingTime, fileName);
        res.sendfile(sourceVideoCacheDir);
    });


    /**
     * 获取可用的缓存目录
     */
    function getCanUseCacheDir(token) {
        var vitrualCacheDirs = _config.vitrualCacheDirs || [];
        if (_config.env == 'pro') {
            return new Promise((resolve) => {
                var _index = 0;
                var videoCacheDir;
                asyncT.whilst(function () {
                    return _index < vitrualCacheDirs.length;
                }, function (whileCb) {
                    var _curr = vitrualCacheDirs[_index];
                    var clientSocket = net.createConnection({
                        port: _curr.nfsPort,
                        host: _curr.nfsIp,
                        timeout: 3000,
                    }, function () {
                        //此处为连接上主机后的回调
                        console.error('------------连接到nfs tcp服务器' + _curr.nfsIp + '成功,token:' + token);
                        videoCacheDir = path.join(_curr.virtualDir, token);
                        _index = vitrualCacheDirs.length;
                        clientSocket.destroy();
                        whileCb();
                    });
                    clientSocket.on('error', function (err) {
                        console.error('------------连接到nfs tcp服务器' + _curr.nfsIp + '失败,token:' + token);
                        ++_index;
                        clientSocket.destroy();
                        whileCb();
                    });
                }, function () {
                    resolve(videoCacheDir);
                });
            });
        } else { 
            return new Promise((resolve) => { 
                var videoCacheDir = '';
                for (var i = 0; i < vitrualCacheDirs.length; i++) {
                    var currDir = vitrualCacheDirs[i];
                    var videoCacheDir2 = path.join(currDir, token);
                    if (!fs.existsSync(videoCacheDir2)) {
                        console.error('------------------------' + videoCacheDir2 + '不存在');
                        continue;
                    }
                    videoCacheDir = videoCacheDir2;
                    break;
                }
                resolve(videoCacheDir);
            });
        }
    };

    /**
     * 从文件服务器下载文件
     * @param {key:'',call:funtion(){}} objParam 
     */
    function downFromFileService(objParam) {
        var key = objParam.key;
        var fileName = key;
        var bufArr = [];
        var isErr = false;
        var res;
        var req = request.get({
            url: global._fileDownServiceUrl + key,
            headers: {
                "content-type": "application/json",
                'cache-control': 'no-cache'
            }
        });
        req.on('error', function (e) {
            isErr = true;
            objParam.call('下载出错: ' + e.message);
            // console.error('下载文件：' + key + '时出错: ' + e.message);
        }).on('response', function (response) {
            res = response;
            if (res.statusCode !== 200 && res.statusCode !== 201) {
                isErr = true;
                return objParam.call('下载时连接错误，状态码：' + res.statusCode);
            }
        }).on('data', function (data) {
            bufArr.push(data);
        }).on('end', function () {
            if (isErr) return;
            objParam.call(null, {
                fileName: fileName,
                buffer: bufArr
            });
        });
    };

    /*上传文件到文件服务器
    * @param {key:'',filePath:'',call:funtion(){}} objParam 
    */
    function uploadToFileService(objParam) {
        return new Promise((resolve) => {
            // resolve(2);
            var key = objParam.key;
            request({
                har: {
                    url: global._fileUploadServiceUrl + key,
                    method: 'POST',
                    headers: [{
                        name: 'content-type',
                        value: 'application/octet-stream'
                    }],
                    postData: {
                        mimeType: 'application/octet-stream',
                        text: fs.readFileSync(objParam.filePath)
                    }
                }
            }, function (err, httpResponse, body) {
                var errStr, errInfo;
                if (err) {
                    errStr = '上传文件' + key + '时错误，错误信息';
                    errInfo = err.stack || err;
                    // console.error('上传文件' + key + '时错误');
                    // console.error(err.stack || err);
                }

                if (httpResponse && httpResponse.statusCode != 200) {
                    // console.error('上传文件：' + key + '的时候连接后台服务异常');
                    // console.error(body);
                    errStr = '上传文件' + key + '的时候连接后台服务异常，异常信息：';
                    errInfo = body;
                }

                var responseObj = {};
                try {
                    responseObj = typeof body == 'object' ? body : JSON.parse(body);
                } catch (e) {
                    responseObj = {};
                }

                if (responseObj.Result != 'success') {
                    errStr = '文件' + key + '上传失败，失败原因：';
                    errInfo = responseObj.ResultMsg || '';
                    // console.error('文件' + key + '上传失败');
                    // console.error(responseObj.ResultMsg);
                }
                resolve({
                    errStr: errStr,
                    errInfo: errInfo
                });
                // objParam.call({
                //     errStr: errStr, errInfo: errInfo
                // });
            });
        });
    };


    /**
     * 查看已完成的报警的报警视频
     */
    router.get('/nendam/:key', function (req, res, next) {
        var key = req.params.key;
        if (!key)
            return res.send(403);
        downFromFileService({
            key: key,
            call: function (err, result) {
                result = result || {};
                var bufferArr = result.buffer;
                if (err || !bufferArr) {
                    console.error('文件下载失败：' + (err.stack || JSON.stringify(err)));
                    return res.send(403);
                }

                var fileName = result.fileName;
                var buffer = Buffer.concat(bufferArr);
                var newFilePath = path.join(global._uploadPath, key);
                fs.writeFile(newFilePath, buffer, function (err) {
                    if (err) {
                        console.error('下载时文件' + newFilePath + '写入 出错' + (err.stack || JSON.stringify(err)));
                        return res.send(403);
                    }
                    res.download(newFilePath, encodeURI(fileName), function () {
                        fs.unlinkSync(newFilePath);
                    });
                });
            }
        });
    });

    /**
     * 查看未完成的报警的报警视频
     */
    router.get('/nendamno/:token/:key', async function (req, res, next) {
        var fileName = req.params.key;
        var token = req.params.token;
        if (!fileName || !token)
            return res.send(403);


        var videoCacheDir = await getCanUseCacheDir(token);
        var newFilePath = path.join(videoCacheDir, sourceVideoDir, fileName);
        if (!newFilePath) {
            console.error('-------------------未完成的报警' + token + '的视频' + fileName + '不存在');
            return res.send(404);
        }
        res.download(newFilePath, encodeURI(fileName));
    });

    /**
      * 裁剪视频，两种情况：
      * 1、已完成的报警，裁剪完视频后进行持久存储
      * 2、未完成的报警，裁剪完视频后进行临时存储
      */
    router.post('/tailorvideo', (req, res, next) => {
        var token = req.body.token || '';
        var startTime = req.body.st || '';
        var endTime = req.body.et || '';
        var alarmState = req.body.as;
        //0 报警未完成      1 报警已完成
        alarmState = alarmState === '0' ? 0 : 1;
        // console.error('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~' + alarmState);
        console.error('------------------查看' + (alarmState == 0 ? '未完成' : '已完成') + '的报警，token：' + token + ',st:' + startTime + ',et:' + endTime);
        var alObj = alarmState == 1 ? endAlarmTailor(token, startTime, endTime) : useingAlarmTailor(token, startTime, endTime);
        alObj.then(function (resolve) {
            console.error(resolve);
            res.send(resolve);
        });
        // res.send(alObj);
    });

    //已完成的报警裁剪
    async function endAlarmTailor(token, startTime, endTime) {
        var alarmStartDate = new Date(startTime);
        var alarmEndDate = new Date(endTime);

        if (!token || alarmStartDate == 'Invalid Date' || alarmEndDate == 'Invalid Date' || alarmStartDate.getTime() == alarmEndDate.getTime())
            return { result: 0, url: '' };    //非法请求

        var videoCacheDir = await getCanUseCacheDir(token);
        if (!fs.existsSync(videoCacheDir))
            return { result: 2, url: '' };   //没有对应的视频文件
        var sourceVideoCacheDir = path.join(videoCacheDir, sourceVideoDir);

        var alarmVideoCacheDir = path.join(videoCacheDir, alarmVideoDir);
        isExistsSyncDir(alarmVideoCacheDir);

        var alarmStartMillSecondTime = alarmStartDate.getTime();
        var alarmEndMillSecondTime = alarmEndDate.getTime();

        return videoTailor(token, sourceVideoCacheDir, alarmVideoCacheDir, alarmStartMillSecondTime, alarmEndMillSecondTime, true);

    };

    //未完成的报警裁剪
    async function useingAlarmTailor(token, startTime, endTime) {
        var alarmStartDate = new Date(startTime);
        var alarmEndDate = new Date(endTime);

        if (!token || alarmStartDate == 'Invalid Date' || alarmEndDate == 'Invalid Date' || alarmStartDate.getTime() == alarmEndDate.getTime())
            return { result: 0, url: '' };    //非法请求

        var videoCacheDir = await getCanUseCacheDir(token);
        if (!fs.existsSync(videoCacheDir))
            return { result: 2, url: '' };   //没有对应的视频文件
        var sourceVideoCacheDir = path.join(videoCacheDir, sourceVideoDir);

        var alarmStartMillSecondTime = alarmStartDate.getTime();
        var alarmEndMillSecondTime = alarmEndDate.getTime();

        return videoTailor(token, sourceVideoCacheDir, sourceVideoCacheDir, alarmStartMillSecondTime, alarmEndMillSecondTime, false);

    };

    //视频裁剪
    async function videoTailor(token, sourceDir, toDir, alarmStartMillSecondTime, alarmEndMillSecondTime, isEnd) {
        try {
            // console.error('###############################sourceDir:' + sourceDir + '  toDir:' + toDir);
            if (alarmStartMillSecondTime >= alarmEndMillSecondTime)
                return { result: 0, url: '' };    //非法请求

            if (!fs.existsSync(sourceDir)) {
                console.error('---------------------' + sourceDir + '不存在');
                return { result: 2, url: '' };   //没有对应的视频文件
            }


            var alarmFileName = new Date(alarmStartMillSecondTime).format('yMdhms') + '_' + new Date(alarmEndMillSecondTime).format('yMdhms') + '.mp4';
            var alarmVideoCacheFilePath = path.join(toDir, alarmFileName);

            //---------------------------------已裁剪过时，直接返回裁剪成功及可访问的视频url
            if (fs.existsSync(alarmVideoCacheFilePath))
                return {
                    result: 1,
                    url: joinAlarmVideoWebUrl(token, alarmFileName, isEnd)
                };

            var filesArr = fs.readdirSync(sourceDir);
            var tempArr = [];

            //---------------------------------先取得sourceVideoCacheDir目录下的所有文件夹放入数组，并按照时间正序排列，以取得小于开始时间的最近的目录，并且大于结束时间的最近的目录
            for (var i = 0; i < filesArr.length; i++) {
                var currDirName = filesArr[i];
                var currPath = path.join(sourceDir, currDirName);
                var stat = fs.lstatSync(currPath);
                if (stat.isFile() === true) continue;

                var currDirDate = getDateByStr(currDirName);
                if (currDirDate == 'Invalid Date') continue;
                tempArr.push({
                    currDirName: currDirName,
                    currDirDate: currDirDate
                });
            }
            tempArr.sort(function (a, b) {
                return a.currDirDate.getTime() - b.currDirDate.getTime();
            });

            //---------------------------------取得小于等于开始时间的最近的目录，并且大于等于结束时间的最近的目录范围之内的目录
            /**
             * 条件判断：1、碎片开始时间等于报警开始时间，则该碎片包含了报警所需的视频片段，同时该碎片作为第一个碎片
             * 2、碎片开始时间小于报警开始时间，因为碎片的视频长度为10秒左右，所以只有离报警开始时间最近的那个碎片才有可能包含了报警所需的视频片段，同时该碎片作为第一个碎片
             * 3、碎片开始时间大于报警开始时间，必须得小于报警结束时间时该碎片才会包含该报警所需的视频片段
             * 4、碎片开始时间大于等于报警结束时间，该碎片肯定不包含该报警所需的视频片段
             * 5、碎片开始时间小于报警结束时间，此时若小于报警开始时间，逻辑同1；此时若大于报警开始时间，逻辑同3
             */
            var isFindMin = false;
            //总时长，单位：秒
            var allCountTime = 0;
            var tsIndex = -1;
            var _tempTsDirName = path.join(toDir, 'temp');
            isExistsSyncDir(_tempTsDirName);
            var videoStartTime;
            var tsArrTxtName = 'tslist.txt';
            var tstxtPath = path.join(_tempTsDirName, tsArrTxtName);
            var _startCacheObj = null;
            var _tsTxtStr = '';
            for (var i = 0; i < tempArr.length; i++) {
                var currTempObj = tempArr[i];
                var _currDirPath = path.join(sourceDir, currTempObj.currDirName);
                var _tsFilesArr = fs.readdirSync(_currDirPath);
                _tsFilesArr.sort(function (a, b) {
                    var afilePath = path.join(_currDirPath, a);
                    var astat = fs.lstatSync(afilePath);

                    var bfilePath = path.join(_currDirPath, b);
                    var bstat = fs.lstatSync(bfilePath);

                    return astat.birthtime.getTime() - bstat.birthtime.getTime();
                });
                for (var j = 0; j < _tsFilesArr.length; j++) {
                    var _tsFileName = _tsFilesArr[j];
                    if (_tsFileName.indexOf('.ts') == -1 || _tsFileName.indexOf('.txt') > -1) continue;
                    var _tsFilePath = path.join(_currDirPath, _tsFileName);
                    var stat = fs.lstatSync(_tsFilePath);
                    var _tsFileCreateTime = stat.birthtime.getTime();
                    //碎片开始时间等于报警开始时间，则该碎片包含了报警所需的视频片段，同时该碎片作为第一个碎片
                    if (_tsFileCreateTime == alarmStartMillSecondTime) {
                        // console.error('###############################相等,文件创建时间' + new Date(_tsFileCreateTime).format('y.M.d h:m:s') + ' 路径' + _tsFilePath);
                        videoStartTime = _tsFileCreateTime;
                        isFindMin = true;

                        // var _tsTimeLengthPath = path.join(_currDirPath, _tsFileName + '.txt');
                        // var currTsTimeLength = fs.existsSync(_tsTimeLengthPath) ? fs.readFileSync(_tsTimeLengthPath, 'utf8') : 10;
                        // allCountTime = allCountTime + (parseFloat(currTsTimeLength) || 0);
                        allCountTime = allCountTime + getTsDuration(_tsFilePath);
                        ++tsIndex;

                        var newFileName = tsIndex + '.ts';
                        var newFilePath = path.join(_tempTsDirName, newFileName);
                        fs.copyFileSync(_tsFilePath, newFilePath);
                        // fs.appendFileSync(tstxtPath, "file '" + newFileName + "'\r\n");
                        _tsTxtStr = "file '" + newFileName + "'\r\n" + _tsTxtStr;
                        continue;
                    }

                    if (_tsFileCreateTime < alarmStartMillSecondTime) {
                        // console.error('###############################小于赋obj,文件创建时间' + new Date(_tsFileCreateTime).format('y.M.d h:m:s') + ' 路径' + _tsFilePath);
                        _startCacheObj = {
                            _tsFileCreateTime: _tsFileCreateTime,   //ts文件的生成时间
                            _tsDirPath: _currDirPath,               //ts文件所处的目录
                            _tsFileName: _tsFileName,               //ts的文件名称
                            _tsFilePath: _tsFilePath                //ts文件的路径
                        };
                        continue;
                    }

                    if (_tsFileCreateTime > alarmStartMillSecondTime && _tsFileCreateTime < alarmEndMillSecondTime) {
                        //代表还没有找到离报警开始时间最近的缓存视频
                        if (!isFindMin && !_startCacheObj) {
                            // console.error('###############################区间内赋obj,文件创建时间' + new Date(_tsFileCreateTime).format('y.M.d h:m:s') + ' 路径' + _tsFilePath);
                            _startCacheObj = {
                                _tsFileCreateTime: _tsFileCreateTime,   //ts文件的生成时间
                                _tsDirPath: _currDirPath,               //ts文件所处的目录
                                _tsFileName: _tsFileName,               //ts的文件名称
                                _tsFilePath: _tsFilePath                //ts文件的路径
                            };
                            continue;
                        }

                        // console.error('###############################区间内,文件创建时间' + new Date(_tsFileCreateTime).format('y.M.d h:m:s') + ' 路径' + _tsFilePath);
                        // var _tsTimeLengthPath = path.join(_currDirPath, _tsFileName + '.txt');
                        // var currTsTimeLength = fs.existsSync(_tsTimeLengthPath) ? fs.readFileSync(_tsTimeLengthPath, 'utf8') : 10;
                        // allCountTime = allCountTime + (parseFloat(currTsTimeLength) || 0);
                        allCountTime = allCountTime + getTsDuration(_tsFilePath);
                        ++tsIndex;

                        var newFileName = tsIndex + '.ts';
                        var newFilePath = path.join(_tempTsDirName, newFileName);
                        fs.copyFileSync(_tsFilePath, newFilePath);
                        // fs.appendFileSync(tstxtPath, "file '" + newFileName + "'\r\n");
                        _tsTxtStr += "file '" + newFileName + "'\r\n";
                    }
                }
            }

            if (!isFindMin && _startCacheObj) {
                videoStartTime = _startCacheObj._tsFileCreateTime;
                isFindMin = true;

                // var _tsTimeLengthPath = path.join(_startCacheObj._tsDirPath, _startCacheObj._tsFileName + '.txt');
                // var currTsTimeLength = fs.existsSync(_tsTimeLengthPath) ? fs.readFileSync(_tsTimeLengthPath, 'utf8') : 10;
                // allCountTime = allCountTime + (parseFloat(currTsTimeLength) || 0);
                var _tsPath2 = path.join(_startCacheObj._tsDirPath, _startCacheObj._tsFileName);
                allCountTime = allCountTime + getTsDuration(_tsPath2);
                ++tsIndex;

                var newFileName = tsIndex + '.ts';
                var newFilePath = path.join(_tempTsDirName, newFileName);
                fs.copyFileSync(_startCacheObj._tsFilePath, newFilePath);
                _tsTxtStr = "file '" + newFileName + "'\r\n" + _tsTxtStr;
            }

            if (allCountTime == 0) {
                cacheClear(_tempTsDirName);
                console.error('---------------------总时长为零');
                return { result: 2, url: '' };   //没有对应的视频文件
            }
            fs.appendFileSync(tstxtPath, _tsTxtStr);
            // console.error('###############################################' + _tsTxtStr);

            //---------------------------------计算裁剪的开始时间、裁剪跨度
            var videoEndTime = videoStartTime + allCountTime * 1000;
            // console.error('##############################视频开始时间：' + new Date(videoStartTime).format('y.M.d h:m:s') + '视频结束时间' + new Date(videoEndTime).format('y.M.d h:m:s') + '总时长' + allCountTime);
            if (alarmStartMillSecondTime >= videoEndTime) {
                cacheClear(_tempTsDirName);
                console.error('---------------------报警开始时间大于视频结束时间');
                return { result: 2, url: '' };   //没有对应的视频文件
            }
            var crossTime = (alarmEndMillSecondTime - alarmStartMillSecondTime) / 1000;
            //裁剪的时长，单位：秒
            var shearCrossTime = crossTime;
            //裁剪的开始时间，格式：hh:mm:ss.0
            var shearStartTime;
            //视频的开始时间戳晚于报警开始时间
            if (videoStartTime >= alarmStartMillSecondTime) {
                shearStartTime = '00:00:00.0';
                //报警跨度时间大于视频总时长时，让裁剪时长等于视频时长
                if (crossTime > allCountTime) shearCrossTime = allCountTime;
            }
            else {
                var h1, m1, s1;
                var t1 = alarmStartMillSecondTime - videoStartTime;
                if (t1 < 1000) {
                    h1 = '00';
                    m1 = '00';
                    s1 = '00';
                    //报警跨度时间大于视频总时长时，让裁剪时长等于视频时长
                    if (crossTime > allCountTime) shearCrossTime = allCountTime;
                } else {
                    var a1 = parseInt(t1 / 1000);
                    var t1Obj = getPrevUnit(a1);
                    s1 = t1Obj.currUnitNum;

                    var t2Obj = getPrevUnit(t1Obj.prevUnitNum);
                    m1 = t2Obj.currUnitNum;

                    h1 = t2Obj.prevUnitNum;

                    s1 = s1 < 10 ? '0' + s1 : s1;
                    m1 = m1 < 10 ? '0' + m1 : m1;
                    h1 = h1 < 10 ? '0' + h1 : h1;

                    //报警跨度时间大于视频总时长时，让裁剪时长等于视频时长减去开始裁剪的秒数
                    if (crossTime > allCountTime) shearCrossTime = allCountTime - a1;
                }
                shearStartTime = h1 + ':' + m1 + ':' + s1 + '.0';
            }

            if (shearCrossTime <= 0) {
                console.error('----------------裁剪时长为零');
                cacheClear(_tempTsDirName);
                return { result: 2, url: '' };   //没有对应的视频文件
            }


            //---------------------------------合并ts转成mp4
            // var cmdStr='d: &&' + 'cd ' + rootPath + ' && ffmpeg -f concat -safe 0 -i "txt文件地址" -acodec copy -vcodec copy -absf aac_adtstoasc mp4地址'
            var tempMp4Path = path.join(_tempTsDirName, alarmFileName);
            var cmdStr = ' ffmpeg -f concat -safe 0 -i ' + tstxtPath +
                //--------非高清不用转码；如果必须转可以试一下在裁剪的同时进行转
                // ' -c:v h264 -absf aac_adtstoasc ' + tempMp4Path;
                // ' -acodec h264 -vcodec copy -absf aac_adtstoasc ' + tempMp4Path;
                ' -acodec copy -vcodec copy -absf aac_adtstoasc ' + tempMp4Path;
            //windows系统
            if (os.type() == 'Windows_NT') {
                var rootStr = path.parse(global._baseDirname).root;
                var rootPath = rootStr.substr(0, rootStr.length - 1);
                var ffmpegBinPath = path.join(global._baseDirname, 'node_modules/ffmpeg-4.2.2/bin');
                cmdStr = rootPath + ' && cd ' + ffmpegBinPath + ' && ' + cmdStr;
            }

            cmdStr = cmdStr.replace(/\\/g, '/');
            childProcess.execSync(cmdStr, { maxBuffer: 1 / 0 });

            //裁剪mp4----不转码
            var cmdStr2 = ' ffmpeg -i ' + tempMp4Path +
                ' -ss ' + shearStartTime + ' -t ' + shearCrossTime + ' -c copy -absf aac_adtstoasc ' + alarmVideoCacheFilePath;

            //裁剪mp4----转码
            // var cmdStr2 = ' ffmpeg -i ' + tempMp4Path +
            //     ' -ss ' + shearStartTime + ' -t ' + shearCrossTime + ' -vcodec h264 -acodec AAC-LC ' + alarmVideoCacheFilePath;

            //windows系统
            if (os.type() == 'Windows_NT') {
                cmdStr2 = rootPath + ' && cd ' + ffmpegBinPath + ' && ' + cmdStr2;
            }
            childProcess.execSync(cmdStr2, { maxBuffer: 1 / 0 });
            // console.error('###############################裁剪cmd:' + cmdStr2);
            cacheClear(_tempTsDirName);
            //已完成的报警，需把报警视频上传到文件服务器
            if (isEnd === true) {
                var _key = token + '_' + alarmFileName;
                var uploadResult = await uploadToFileService({
                    key: _key,
                    filePath: alarmVideoCacheFilePath
                    // call: function (errStr, errInfo) {

                    // }
                });
                uploadResult = uploadResult || {};
                if (uploadResult.errStr) {
                    console.error(errStr);
                    console.error(errInfo);
                    return { result: 3, url: '' };
                }
                try {
                    fs.unlinkSync(alarmVideoCacheFilePath);
                } catch (e) {
                    console.error('删除裁剪后的视频文件' + alarmVideoCacheFilePath + '时错误，错误信息：' + e.message);
                }
                return {
                    result: 1,
                    url: joinAlarmVideoWebUrl(token, _key, isEnd)
                };
            }
            return {
                result: 1,
                url: joinAlarmVideoWebUrl(token, alarmFileName, isEnd)
            };
        } catch (e) {
            cacheClear(_tempTsDirName);
            console.error('裁剪视频异常：' + e.message);
            return { result: 3, url: '' };
        }

    };

    //生成查看报警视频路线
    function joinAlarmVideoWebUrl(token, alarmVideoFileName, isEnd) {
        // return isEnd === true ? _config.accessDomin + 'nendam/' + alarmVideoFileName : _config.accessDomin + 'video/' + token + '/' + sourceVideoDir + '/' + alarmVideoFileName;
        return isEnd === true ? _config.accessDomin + 'nendam/' + alarmVideoFileName : _config.accessDomin + 'nendamno/' + token + '/' + alarmVideoFileName;
    };

    function getDateByStr(str) {
        var dateStr = str.substr(0, 4) + '-' + str.substr(4, 2) + '-' + str.substr(6, 2) + ' ' + str.substr(8, 2) + ':' + str.substr(10, 2) + ':' + str.substr(12, 2);
        return new Date(dateStr);
    };

    //清除之前的缓存文件
    function cacheClear(originPath) {
        try {
            var filesArr = fs.readdirSync(originPath);
            for (var i = 0; i < filesArr.length; i++) {
                var currPath = path.join(originPath, filesArr[i]);
                var stat = fs.lstatSync(currPath);
                if (stat.isFile() === false) {
                    cacheClear(currPath);
                } else
                    fs.unlinkSync(currPath);
            }
            fs.rmdirSync(originPath);
        } catch (e) {
            console.error('删除缓存文件错误');
            console.error(e.message);
        }
    };

    function getPrevUnit(sourceNum) {
        if (sourceNum < 60)
            return {
                prevUnitNum: 0,
                currUnitNum: sourceNum
            };
        var prevUnitNum = parseInt(sourceNum / 60);
        var currUnitNum = sourceNum - prevUnitNum * 60;
        return {
            prevUnitNum: prevUnitNum,
            currUnitNum: currUnitNum
        };
    };

    //获取ts文件的时长 单位：秒
    function getTsDuration(tsFilePath) {
        var timeLength = 10;
        try {
            var cmdStr = 'ffprobe  -show_entries format=duration  -of json -i ' + tsFilePath;
            if (os.type() == 'Windows_NT') {
                var rootStr = path.parse(global._baseDirname).root;
                var rootPath = rootStr.substr(0, rootStr.length - 1);
                var ffmpegBinPath = path.join(global._baseDirname, 'node_modules/ffmpeg-4.2.2/bin');
                cmdStr = rootPath + ' && cd ' + ffmpegBinPath + ' && ' + cmdStr;
            }

            var ffprobeCprocess = childProcess.execSync(cmdStr);
            if (ffprobeCprocess instanceof Buffer) {
                timeLength = JSON.parse(ffprobeCprocess.toString()).format.duration || timeLength;
            }
        } catch (e) {
            console.error('获取ts时长异常' + e.message);
        } finally {
            return timeLength;
        }
    }


    router.get('/hls', function (req, res, next) {
        res.render('layout_hls');
    });

};
