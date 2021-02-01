
var request = require('public_nodejs/request');
var fs = require('fs');
var path = require('path');
var asyncT = require('async');
var oriConfigInfo = require('./config');
var _config = oriConfigInfo.env == 'dev' ? oriConfigInfo.devEnvConfig : oriConfigInfo.proEnvConfig;

var log4 = require('common/log4logger');
log4.CreateLog(null, path.join(__dirname, 'logs_upload'));


snedSelCmd();
function snedSelCmd() {
    process.send({
        cmd: 'sel'
    });
}

process.on('message', function (msgObj) {
    msgObj = msgObj || {};
    switch (msgObj.cmd) {
        case 'upload':
            enter(msgObj);
            break;
        case 'updated':
            snedSelCmd();
            break;
    }
});


/**
 * 定时轮询，以上传hls碎片
 */
function enter(_pobj) {
    var waitUploadObj = _pobj.liveInfoObj || {};
    var tokensArr = Object.keys(waitUploadObj);

    //循环token
    var tokenEachIndex = 0;
    console.error('--------------------开始循环');
    asyncT.whilst(function () {
        console.error('--------------------循环索引' + tokenEachIndex);
        return tokenEachIndex < tokensArr.length;
    }, function (whileCbToken) {
        var currToken = tokensArr[tokenEachIndex];
        var _tokenObj = waitUploadObj[currToken];
            var _time = _tokenObj.time;
            var uploadIndex = _tokenObj.uploadIndex + 1;
            var tsFileDirPath = path.join(_config.fileCachDir, currToken, 'source', _time);
            var filesArr = fs.readdirSync(tsFileDirPath);
            var tsFileCount = filesArr.length - 2;


        var _createTimeArr = Object.keys(_tokenObj);
        console.error('--------------------_tokenObj:'+JSON.stringify(_tokenObj));
        //循环每个token内的不同时间
        var timeEachIndex = 0;
        asyncT.whilst(function () {
            return timeEachIndex < _createTimeArr.length;
        }, function (whileCbTime) {
            var currCreateTime = _createTimeArr[timeEachIndex];
            if (currCreateTime == 'useingTime') {
                ++timeEachIndex;
                whileCbTime();
                return;
            }
            var _currTokenUseingTime = _tokenObj.useingTime;
            var _createTimeObj = _tokenObj[currCreateTime];
            var uploadIndex = _createTimeObj.uploadIndex + 1;
            console.error('--------------------上传的索引:'+uploadIndex);
            var tsFileDirPath = path.join(_pobj._hlsCacheDir, currToken, currCreateTime);
            var filesArr = fs.readdirSync(tsFileDirPath);
            var tsFileCount = filesArr.length - 2;
            var isCanUpload = false;
            // if (uploadIndex < tsFileCount) {
                var nextUploadIndex = uploadIndex + 1;
                var nextTsFilePath = joinTsFilePath(tsFileDirPath, nextUploadIndex);
                var isExistsNextFile = fs.existsSync(nextTsFilePath);
                //正在使用ffmpeg写入的，下一个文件出来时上传上一个文件
                if ((currCreateTime == _currTokenUseingTime && isExistsNextFile) || currCreateTime != _currTokenUseingTime) {
                    isCanUpload = true;
                }
                // if (uploadIndex == tsFileCount - 1 || fs.existsSync(nextTsFilePath))
                //     isCanUpload = true;
                if (isCanUpload) {
                    _createTimeObj.uploadIndex = uploadIndex;

                    // asyncT.parallel([uploadTs, uploadM3u8], function (parErr, parResult) {
                    //     ++timeEachIndex;
                    //     whileCbTime();
                    // });

                    uploadTs(function () {
                        uploadM3u8(function () {
                            //不是当前正在生成的文件夹的话，如果上传到最后一个，那么把之前对应的全局对象清除
                            if (!isExistsNextFile && currCreateTime != _currTokenUseingTime) {
                                _tokenObj[currCreateTime] = null;
                                delete _tokenObj[currCreateTime];
                            }

                            ++timeEachIndex;
                            whileCbTime();
                        });
                    });

                    function uploadTs(tsCall) {
                        var uploadTsFilePath = joinTsFilePath(tsFileDirPath, uploadIndex);
                        uploadHls({
                            token: currToken,
                            time: currCreateTime,
                            filePath: uploadTsFilePath,
                            call: function () {
                                // ++timeEachIndex;
                                // whileCbTime();
                                tsCall();
                            }
                        });
                    };

                    function uploadM3u8(m3u8Call) {
                        uploadHls({
                            token: currToken,
                            time: currCreateTime,
                            filePath: path.join(tsFileDirPath, 'playlist.m3u8'),
                            call: function () {
                                //++timeEachIndex;
                                //whileCbTime();
                                m3u8Call();
                            }
                        });
                    };

                } else {
                    console.error('----------------不能上传，路径：' + tsFileDirPath + ' 索引：' + uploadIndex);
                    ++timeEachIndex;
                    whileCbTime();
                }
            // } else {
            //     _createTimeObj.isDel = true;
            //     ++timeEachIndex;
            //     whileCbTime();
            // }

        }, function (whileErrTime) {
            ++tokenEachIndex;
            whileCbToken();
        });


    }, function (whileErrToken) {
        console.error('--------------------结束循环');
        timerS(waitUploadObj);
    });
};

function timerS(waitUploadObj) {
    // setTimeout(enter, 3000);
    // enter();
    process.send({
        cmd: 'update',
        newData: waitUploadObj
    });
}

function uploadHls(obj) {
    var token = obj.token;
    var time = obj.time;
    var filePath = obj.filePath;
    if (!fs.existsSync(filePath)) return;
    var formData = {
        //当前视频对应的视频流的token
        token: token,
        //该条文件对应的进程产生的时间，用以区分是不是同一套碎片
        time: time,
        file: fs.createReadStream(filePath)
    };
    console.error('--------------------即将上传：' + filePath);
    request.post({ url: 'http://' + _config.receiveIp + '/upd', formData: formData }, function optionalCallback(err, httpResponse, body) {
        //console.error('---------------------收到返回');
        //---------------------------暂时不考虑上传失败的问题
        console.error('---------------------结束上传：'+filePath);
		if(err){
			console.error('----------------------上传失败');
			console.error(err.stack||JSON.stringify(err));
		}
        if (httpResponse && httpResponse.statusCode != 200) {
			console.error(httpResponse);
		}
        obj.call();
    });
}

function joinTsFilePath(dirName, index) {
    return path.join(dirName, 'out' + index + '.ts');
}
