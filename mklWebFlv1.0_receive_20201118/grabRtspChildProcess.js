/**开启ffmpeg进程，同时会被动开启cmd窗口进程 */
var childProcess = require('child_process');
var path = require('path');
var fs = require('fs');
var os = require('os');
var log4 = require('common/log4logger');
log4.CreateLog(null, path.join(__dirname, 'logs_ffmpeg'));

process.on('message', function (msgObj) {
    msgObj = msgObj || {};
    var _tempObj = msgObj._obj;
    var token = _tempObj.token || '';
    console.log('----------------------------------------开始新建ffmpeg进程，token：' + token);
    
    if (!token) return process.send({ p: 0 });
    var _baseDirName = msgObj._dirname;
    var rootStr = path.parse(_baseDirName).root;
    var rootPath = rootStr.substr(0, rootStr.length - 1);
    var ffmpegBinPath = path.join(_baseDirName, 'node_modules/ffmpeg-4.2.2/bin');
    var ffmpegName = 'ffmpeg.exe';
    var outPutPath = path.join(msgObj._hlsCacheDir, token);
    var newFfmpegPath = outPutPath;
    if (!fs.existsSync(outPutPath)) {
        fs.mkdirSync(outPutPath);
    }

    outPutPath = path.join(outPutPath, 'source');
    if (!fs.existsSync(outPutPath)) {
        fs.mkdirSync(outPutPath);
    }

    outPutPath = path.join(outPutPath, msgObj._currTime);
    if (!fs.existsSync(outPutPath)) {
        fs.mkdirSync(outPutPath);
    }

    var ffmpegCmdName = (os.type() == 'Windows_NT' ? token + '_' : '') + 'ffmpeg';
    
    //windows系统
    if (os.type() == 'Windows_NT') { 
        var newFfmpegExePath = path.join(newFfmpegPath, ffmpegCmdName + '.exe');
        if (!fs.existsSync(newFfmpegExePath))
            fs.copyFileSync(path.join(ffmpegBinPath, ffmpegName), newFfmpegExePath);
    }

    var streamName = token;
    var rtmpPath = '/live/' + streamName;
    var flvUrl = 'http://localhost:' + _tempObj.httpPort + rtmpPath + '.flv';

    
    var m3u8Path = path.join(outPutPath, 'playlist.m3u8');
    var tsPath = path.join(outPutPath, 'out%03d.ts');
    var ffmpegCmdStr = ffmpegCmdName + ' -i ' + flvUrl + ' -c copy -map 0 -f ssegment -segment_format mpegts -segment_list '+
        m3u8Path + ' -segment_list_flags +live -segment_list_size 6 -segment_time 3 ' + tsPath;
    // var ffmpegCmdStr = ffmpegCmdName + ' -i ' + flvUrl + ' -force_key_frames "expr:gte(t,n_forced*10)" -c copy -hls_list_size 10 -hls_time 10 -f hls ' + m3u8Path;
    //-hls_time 10 -hls_list_size 0 -f hls /root/download/智慧城市大脑.m3u8

    // var cmdStr = rootPath + '&&' +
    //     'cd ' + ffmpegBinPath + '&&' + ffmpegCmdStr;

    
    var cmdStr = (os.type() == 'Windows_NT' ? rootPath + '&&' + 'cd ' + newFfmpegPath + '&&' : '') + ffmpegCmdStr;

    // var cmdProcess = childProcess.spawn(cmdStr);
    console.error('-------------cmdStr：' + cmdStr);
    var cmdProcess = childProcess.exec(cmdStr, { maxBuffer: 1 / 0 }, function (err) {
        // err ? (console.error('子进程调用抓取flv的命令失败'), console.error(err.stack || JSON.stringify(err))) : console.log('子进程调用抓取flv的命令成功');
        var errStr = err ? (err.stack || JSON.stringify(err)) : '';
        err ? (console.error('子进程调用抓取rtsp的命令失败,token：' + token + '，错误信息：' + errStr)) : console.error('子进程调用抓取rtsp的命令成功');

        //进入这个回调时，无论成功还是失败，都已经自动关闭了ffmpeg和cmd进程
        process.send({
            p: 2,
            // pid: pid,
            cmdProcessPid: cmdProcess.pid
        });
    });

    return process.send({
        p: 1,
        // url: 'http://' + msgObj.httpIp + ':' + _currRtmpConfig.http.port + rtmpPath + '.flv?token=' + token,
        //url: 'http://' + msgObj.httpIp + ':' + _currRtmpConfig.http.port + rtmpPath + '.flv',
        // pid: pid,
        cmdProcessPid: cmdProcess.pid
    });
});