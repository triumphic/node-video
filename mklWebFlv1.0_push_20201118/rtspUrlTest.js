/**
 * 定时轮询，以判断rtsp地址是否可连接
 */
var path = require('path');
var request = require('public_nodejs/request');
var childProcess = require('child_process');
var oriConfigInfo = require('./config');
var asyncT = require('async');
var _config = oriConfigInfo.env == 'dev' ? oriConfigInfo.devEnvConfig : oriConfigInfo.proEnvConfig;
var timeOut = 1000 * 15;    //15秒
var net = require('net');
var ffprobePath = path.join(__dirname, 'node_modules/ffmpeg-4.2.2/bin');
var rootStr = path.parse(__dirname).root;
var rootPath = rootStr.substr(0, rootStr.length - 1);
var log4 = require('common/log4logger');
log4.CreateLog(null, path.join(__dirname, 'logs_rtspTest'));
timer();
function timer() {
    setTimeout(function () {
        start();
    }, timeOut);
};


function start() {
    var rtspArr = _config.rtsp || [];
    var eachIndex = 0;
    asyncT.whilst(function () {
        return eachIndex < rtspArr.length;
    }, function (whileCb) {
        var _tempObj = rtspArr[eachIndex];
        var rtspUrl = _tempObj.url;
        var ipcStr = rtspUrl.split('@')[1];
        var hostPath = ipcStr.split('/')[0];
        var _arr = hostPath.split(':');
        var ip = _arr[0];
        var port = _arr[1];

        var clientSocket = net.createConnection({
            port: port,
            host: ip,
            timeout: 30000,
            //path: '/mpeg4/ch03/sub/av_stream'
        }, function () {
            //此处为连接上主机后的回调
            console.error('------------连接到tcp服务器，即将测试rtsp流');
            var ffprobeCmdStr = 'ffprobe -v quiet -print_format json -show_format ' + rtspUrl;
            var cmdStr = rootPath + '&&' + 'cd ' + ffprobePath + '&&' + ffprobeCmdStr;
            var buff;
            try {
                buff = childProcess.execSync(cmdStr);
            } catch (e) {
                buff = null;
            }

            var str1 = buff ? buff.toString() : '';
            var ffprobeObj = {};
            try {
                ffprobeObj = str1 ? JSON.parse(str1) : {};
            } catch (e) {
                ffprobeObj = {};
            }
            //不存在format的时候说明rtsp流不可用，此时报警状态为true
            if (!ffprobeObj.format) {
                console.error('摄像头rtsp流不可用，开始查询该设备是否处于报警状态中。token：' + _tempObj.token + ',rtsp：' + _tempObj.url);
                process.send({
                    cmd: 'sel',
                    token: _tempObj.token
                });
                killProcess( _tempObj.token);
            } else {
                process.send({
                    cmd: 'update',
                    token: _tempObj.token,
                    newState: false
                });
            }

            clientSocket.destroy();
            ++eachIndex;
            whileCb();
            // process.send({
            //     cmd: 'update',
            //     token: token,
            //     newState: false
            // });
            // clientSocket.destroy();
            // ++eachIndex;
            // whileCb();
        });

        clientSocket.on('error', function (err) {
            //console.error('----------------');
            //[2020-10-21 15:43:53.765] [ERROR] log_file - {"errno":"ETIMEDOUT","code":"ETIMEDOUT","syscall":"connect","address":"192.168.3.251","port":554}
            // if (err.code == 'ETIMEDOUT') {
            console.error('摄像头故障，开始查询该设备是否处于报警状态中。token：' + _tempObj.token + ',rtsp：' + _tempObj.url);
            process.send({
                cmd: 'sel',
                token: _tempObj.token
            });
            killProcess( _tempObj.token);
            clientSocket.destroy();
            ++eachIndex;
            whileCb();
            // sendCameraFault({
            //     token: _tempObj.token,
            //     call: function () {
            //         clientSocket.destroy();
            //         ++eachIndex;
            //         whileCb();
            //     }
            // });
            // }

        });

        // clientSocket.on('timeout', function () {
        //     // console.log('-----连接超时');
        // });

        // //监听数据
        // clientSocket.on('data', data => {
        //     console.log('服务器返回的数据：', data.toString());

        //     //向服务端发送数据
        //     // clientSocket.write('get info')
        // })

        // clientSocket.on('end', function () {
        //     console.error('------------当前tcp连接结束');
        //     ++eachIndex;
        //     whileCb();
        // });
    }, function () {
        timer();
    });
}

process.on('message', function (msgObj) {
    msgObj = msgObj || {};
    switch (msgObj.cmd) {
        case 'sel_result':
            //如果某设备已经处于报警状态，则不再发送报警通知
            if (msgObj.alarmState === true) return;
            sendCameraFault({
                token: msgObj.token,
                call: function (noticeResult) {
                    //通知成功时，要把当前设备在本地服务器的报警状态更新为true
                    if (noticeResult === true) {
                        process.send({
                            cmd: 'update',
                            token: msgObj.token,
                            newState: true
                        });
                    }
                }
            });
            break;
    }
});

function sendCameraFault(obj) {
    // if (typeof obj.call == 'function')
    //     obj.call();
    // return;
    var token = obj.token;
    console.error('-------------------即将发送摄像头故障通知，token：' + token);
    request.post({
        url: _config.serviceUrl,
        form: {
            // jsonString: JSON.stringify({
            //     'token': token
            // })
            'token': token
        },
        timeout: 1000 * 60
    }, function (err, httpResponse, body) {
        var resultObj;
        try {
            resultObj = body ? JSON.parse(body) : {};
        } catch (e) {
            resultObj = {};
        }
        var noticeResult = true;
        if (resultObj.result != 'success') {
            console.error('------------摄像头故障通知发送失败，失败原因：' + resultObj.reason);
            noticeResult = false;
        }
        if (err) {
            console.error('发送摄像头故障通知时错误，token：' + token + '，错误信息：' + (err.stack || JSON.stringify(err)));
            noticeResult = false;
        }

        if (httpResponse && httpResponse.statusCode != 200) {
            console.error('发送摄像头故障通知时连接后台服务异常，返回结果:');
            console.error(body);
            noticeResult = false;
        }
        console.error('-------------------摄像头故障通知发送完毕，即将进入回掉，token：' + token);
        if (typeof obj.call == 'function')
            obj.call(noticeResult);
    });
}

//如果存在连接不上的摄像头对应的进程时要主动杀死
function killProcess(token) {
    var ffmpegProcessName = token + '_ffmpeg.exe';
    var getFFmpegProcessCmd = 'tasklist /fi "Imagename eq ' + ffmpegProcessName + '"';
    childProcess.exec(getFFmpegProcessCmd, function (err, stdout, stderr) {
        if (err) {
            console.error('----------------------------------------摄像头故障杀死进程，获取' + ffmpegProcessName + '进程时错误');
            console.error(err);
            return;
        }

        stdout = (stdout || '').trim();
        if (stdout.length == 0) {
            console.error('-------------------------摄像头故障杀死进程，没有对应的' + ffmpegProcessName + '进程----------------------');
            return;
        }
        var tempArr = stdout.split('\n');
        var ffmpegPid;
        for (var i = 0; i < tempArr.length; i++) {
            var line = tempArr[i];
            var p = line.trim().split(/\s+/), pname = p[0], ffmpegPid = parseInt(p[1]);
            if (pname.toLowerCase() == ffmpegProcessName && ffmpegPid) {
                console.log('-------------------------摄像头故障杀死进程，' + ffmpegProcessName + '的进程ID是' + ffmpegPid + '----------------------');
                break;
            }
        }
        if (!ffmpegPid) { 
            console.error('-------------------------摄像头故障杀死进程，没有对应的' + ffmpegProcessName + '进程----------------------');
            return;
        }
        delIng({
            childProcessPid: '',
            cmdProcessPid: '',
            ffmpegPid: ffmpegPid
        });
    });
};

function delIng(_obj) {
    try {
        _obj = _obj || {};
        var childProcessPid = _obj.childProcessPid;
        var cmdProcessPid = _obj.cmdProcessPid;
        var ffmpegPid = _obj.ffmpegPid;
        if (ffmpegPid)
            process.kill(ffmpegPid);
        if (cmdProcessPid)
            process.kill(cmdProcessPid);
        if (childProcessPid)
            process.kill(childProcessPid);
    } catch (e) { 
        console.error('摄像头故障杀死进程失败，原因：' + e.message);
    }
};
