/**
 * 1小时一个轮询，以删除缓存的视频文件
 */
var oriConfigInfo = require('./config');
var request = require('public_nodejs/request');
var path = require('path');
var fs = require('fs');
var net = require('net');
var asyncT = require('async');
// var timeOut = 1000 * 5;
var timeOut = 1000 * 60 * 60;    //定时器时间 1小时
// var deledTime = 1000 * 60;
var deledTime = 1000 * 60 * 60;         //多久前的文件为作废
var notDelTimeArr = {};
var _config = oriConfigInfo.env == 'dev' ? oriConfigInfo.devEnvConfig : oriConfigInfo.proEnvConfig;

var log4 = require('common/log4logger');
log4.CreateLog(null, path.join(__dirname, 'logs_clearts'));

timer();
function timer() {
    setTimeout(function () {
        start();
    }, timeOut);
};


function start() {
    request.post({
        url: _config.serviceUrl,
        form: {
            jsonString: JSON.stringify({
                'token': 'xxxxxx'
            })
        },
        timeout: 1000 * 60
    }, function (err, httpResponse, body) {
        if (err) {
            console.error('获取不可删除的视频时间时错误');
            console.error(err.stack || err);
        }

        if (httpResponse && httpResponse.statusCode != 200) {
            console.error('连接后台服务异常');
            console.error(body);
        }

        var responseObj = {};
        try {
            responseObj = JSON.parse(body);
        } catch (e) {
            responseObj = {};
        } finally {
            var retContent = (responseObj.content || [])[0] || [];
            var nowTime = new Date().getTime();
            notDelTimeArr = {};
            retContent.forEach(function (curr) {
                var _date = new Date(curr.st);
                var _date2 = new Date(curr.et);
                if (_date != 'Invalid Date' && _date2 != 'Invalid Date') {
                    notDelTimeArr[curr.token] = {
                        stime: _date.getTime(),
                        etime: _date2.getTime(),
                        st: curr.st,
                        et: curr.et
                    };
                }
            });

            var videoCacheDir = _config.fileCachDir ? path.join(_config.fileCachDir) : path.join(__dirname, 'public/video');
            if (!fs.existsSync(videoCacheDir)) return timer();
            console.error('---------------开始清除，时间：' + new Date().toLocaleString() + ' 不能删除的内容：' + JSON.stringify(notDelTimeArr));

            /**
             * 碎片缓存文件的目录结构为：video/token名称/source/时间/碎片文件
             * 已完成的报警的裁剪的mp4目录结构为：video/token名称/alarm/mp4文件
             * 未完成的报警的裁剪的mp4目录结构为：video/token名称/source/mp4文件
             */
            //此级目录为token名称
            var filesArr = fs.readdirSync(videoCacheDir);
            for (var i = 0; i < filesArr.length; i++) {
                var _tokenName = filesArr[i];
                var currPath = path.join(videoCacheDir, _tokenName);
                var stat = fs.lstatSync(currPath);
                if (stat.isFile()) {
                    fs.unlinkSync(currPath);
                    continue;
                }
                cacheClear(currPath, nowTime, _tokenName);
            }
            timer();
        }
    });
}

//清除缓存
function cacheClear(originPath, nowTime, token) {
    try {
        // console.error('-------------------------源路径：' + originPath);
        var filesArr = fs.readdirSync(originPath);
        for (var i = 0; i < filesArr.length; i++) {
            var _name = filesArr[i];
            var currPath = path.join(originPath, _name);
            var stat = fs.lstatSync(currPath);
            // console.error('-------------------------文件路径：' + currPath);
            if (stat.isFile() === false && _name == 'alarm')
                continue;
            if (stat.isFile() === false) {
                cacheClear(currPath, nowTime, token);
            } else {
                // //生成时间或者最后修改时间
                // var fileTime = stat.birthtime.getTime() || stat.mtime.getTime();

                //文件的最后修改时间
                var fileTime = stat.mtime.getTime();
                // console.error('-------------------------最后修改时间：' + stat.mtime.toLocaleString());
                //一个小时前的文件才可删除
                if (nowTime - fileTime >= deledTime) {
                    // console.error('-------------------------最后修改时间在一个小时之前');
                    //文件后缀
                    var fileSuffix = _name.substr(_name.lastIndexOf('.') + 1);
                    switch (fileSuffix) {
                        //ts碎片文件的修改时间不在后台返回的不能删除的时间列表内时才可删除
                        case 'ts':
                            if (comparTime(fileTime, token)) {
                                console.error('-----------------文件：' + currPath + ' 满足条件即将被删除');
                                fs.unlinkSync(currPath);
                                remoceVirtualDirFile(currPath);
                            }
                            break;
                        /**
                         * 此处的mp4文件为临时存储，即未完成的报警的报警视频，一个小时前生成的即可删除；问题：删除的同时正在被读取(返回给浏览器端)
                         * m3u8文件，一个小时前的也可删除；
                         * 其他文件直接删除
                         */
                        default:
                            console.error('-----------------文件：' + currPath + ' 满足条件即将被删除');
                            fs.unlinkSync(currPath);
                            remoceVirtualDirFile(currPath);
                            break;
                    }
                }
            }
        }
        filesArr = fs.readdirSync(originPath);
        if (filesArr.length == 0)
            fs.rmdirSync(originPath);
    } catch (e) {
        console.error('删除缓存文件错误');
        console.error(e.message);
    }
}

//在后台返回的时间范围内的缓存不可删除
function comparTime(fileTime, token) {
    var _obj = notDelTimeArr[token];
    if (!_obj) return true;
    if (fileTime >= _obj.stime && fileTime <= _obj.etime)
        return false;
    return true;
};

//删除虚拟目录内的文件
function remoceVirtualDirFile(bendiFilePath) {
    var pathSuffix = bendiFilePath.split('/').slice(3).join('/');
    // var vitrualCacheDirs = _config.vitrualCacheDirs || [];
    // for (var i = 0; i < vitrualCacheDirs.length; i++) {
    //     var currDir = vitrualCacheDirs[i];
    //     var videoCacheDir = path.join(currDir, pathSuffix);
    //     if (!fs.existsSync(videoCacheDir)) {
    //         console.error('------------------------清除文件缓存时，' + videoCacheDir + '不存在');
    //         continue;
    //     }
    //     console.error('-----------------文件：' + videoCacheDir + ' 满足条件即将被删除');
    //     fs.unlinkSync(videoCacheDir);
    // }

    var vitrualCacheDirs = _config.vitrualCacheDirs || [];
    var _index = 0;
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
            console.error('------------删除视频时连接到nfs tcp服务器' + _curr.nfsIp + '成功');
            var videoCacheDir = path.join(_curr.virtualDir, pathSuffix);
            if (!fs.existsSync(videoCacheDir)) {
                console.error('------------------------清除文件缓存时，' + videoCacheDir + '不存在');
            } else {
                console.error('-----------------文件：' + videoCacheDir + ' 满足条件即将被删除');
                fs.unlinkSync(videoCacheDir);
            }
            ++_index;
            clientSocket.destroy();
            whileCb();
        });
        clientSocket.on('error', function (err) {
            console.error('------------连接到nfs tcp服务器' + _curr.nfsIp + '失败');
            ++_index;
            clientSocket.destroy();
            whileCb();
        });
    }, function () {
        
    });

};