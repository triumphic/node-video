/**开启ffmpeg进程，同时会被动开启cmd窗口进程 */
var childProcess = require('child_process');
var path = require('path');
var fs = require('fs');
process.on('message', function (msgObj) {
    msgObj = msgObj || {};
    var token = msgObj.token || '';
    console.log('----------------------------------------开始新建ffmpeg进程，token：' + token);
    var configInfo = msgObj.configInfo || {};
    var rtspConfig = configInfo.rtsp || {};
    var rtspInfo = rtspConfig[token] || {};
    var pid = msgObj.pid;
    if (!token || !rtspInfo.url) return process.send({ p: 0, pid: pid });
    var rootStr = path.parse(__dirname).root;
    var rootPath = rootStr.substr(0, rootStr.length - 1);
    var ffmpegBinPath = path.join(__dirname, 'node_modules/ffmpeg-4.2.2/bin');
    var ffmpegName = 'ffmpeg.exe';
    var outPutPath = path.join(__dirname, 'public/flvCache', token);
    var newFfmpegPath = outPutPath;
    if (!fs.existsSync(outPutPath)) {
        fs.mkdirSync(outPutPath);
    }


    var ffmpegCmdName = token + '_ffmpeg';
    var newFfmpegExePath = path.join(newFfmpegPath, ffmpegCmdName+ '.exe');
    if (!fs.existsSync(newFfmpegExePath))
        fs.copyFileSync(path.join(ffmpegBinPath, ffmpegName), newFfmpegExePath);

    //rtspCount  为已有的rtsp流数量；一个NodeMediaServer只能接收6个推流，超过后要放到别的NodeMediaServer里
    var _configArr = configInfo.rtmpConfig instanceof Array ? configInfo.rtmpConfig : [configInfo.rtmpConfig];
    var rtmpConfigIndex = parseInt(msgObj.rtspCount / 6);
    console.log('-------------------------------rtspCount：' + msgObj.rtspCount + '，rtmpConfigIndex：' + rtmpConfigIndex);
    var _currRtmpConfig = _configArr[rtmpConfigIndex] || _configArr[0];
    var streamName = token;
    var rtmpPath = '/live/' + streamName;
    var rtmpUrl = 'rtmp://localhost:' + _currRtmpConfig.rtmp.port + rtmpPath;
    console.log('-------------------------------------------新的rtmpPath：' + rtmpPath + '，rtmpUrl：' + rtmpUrl + '，token：' + token + '----------------------------------------');

    // ffmpeg -f video4linux2 -i /dev/video0 -vcodec libx264 -acodec libvo_aacenc -b 1080k -r 33 -preset:v ultrafast -tune:v zerolatency -f flv rtmp://localhost:1935/live/STREAM_NAME
    var ffmpegCmdStr = ffmpegCmdName + ' -i "D:/study/testWebFlv1.1_temp/a.mkv" -vcodec libx264 -acodec aac -b 1080k -r 33 -preset:v ultrafast -tune:v zerolatency -f flv ' + rtmpUrl;

    // var cmdStr = rootPath + '&&' +
    //     'cd ' + ffmpegBinPath + '&&' + ffmpegCmdStr;

    var cmdStr = rootPath + '&&' +
        'cd ' + newFfmpegPath + '&&' + ffmpegCmdStr;

    // var cmdProcess = childProcess.spawn(cmdStr);
    var cmdProcess = childProcess.exec(cmdStr, { maxBuffer: 1 / 0 }, function (err) {
        err ? (console.error('子进程调用抓取rtsp的命令失败'), console.error(err.stack || JSON.stringify(err))) : console.log('子进程调用抓取rtsp的命令成功');
        //进入这个回调时，无论成功还是失败，都已经自动关闭了ffmpeg和cmd进程
        process.send({
            p: 2,
            pid: pid,
            cmdProcessPid: cmdProcess.pid
        });
    });

    return process.send({
        p: 1,
        // url: 'http://' + msgObj.httpIp + ':' + _currRtmpConfig.http.port + rtmpPath + '.flv?token=' + token,
        url: 'http://' + msgObj.httpIp + ':' + _currRtmpConfig.http.port + rtmpPath + '.flv',
        pid: pid,
        cmdProcessPid: cmdProcess.pid
    });
});