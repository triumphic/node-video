/**开启ffmpeg进程，同时会被动开启cmd窗口进程 */
var childProcess = require('child_process');
var path = require('path');
var fs = require('fs');
var log4 = require('common/log4logger');
log4.CreateLog(null, path.join(__dirname, 'logs_ffmpeg'));
process.on('message', function (msgObj) {
    msgObj = msgObj || {};
    var rtspConfig = msgObj.rtspConfig;
    var rtmpConfig = msgObj.rtmpConfig;

    var token = rtspConfig.token || '';
    console.log('----------------------------------------开始新建ffmpeg进程，token：' + token);
    // var configInfo = msgObj.configInfo || {};
    // var rtspConfig = configInfo.rtsp || {};
    // var rtspInfo = rtspConfig[token] || {};
    if (!token || !rtspConfig.url) return process.send({ p: 0 });
    //#region 拷贝ffmpeg.exe到临时目录
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
    
    //#endregion 拷贝ffmpeg.exe到临时目录，结束

    var streamName = token;
    var rtmpPath = '/live/' + streamName;
    var rtmpUrl = 'rtmp://' + rtmpConfig.host + (rtmpConfig.port ? ':' + rtmpConfig.port : '') + rtmpPath + '?sign=' + msgObj.sign;

    // var expireData = parseInt((Date.now() + 172800000) / 1000);
    // var _str = '/live/' + streamName + '-' + expireData + '-br_mkl_2020_video';
    // var md5 = crypto.createHash('md5');
    // var hashValue = md5.update(_str, 'utf8').digest('hex');
    // var sign = expireData + '-' + hashValue;
    // rtmpUrl += '?sign=' + sign;


    console.log('-------------------------------------------新的rtmpPath：' + rtmpPath + '，rtmpUrl：' + rtmpUrl + '，token：' + token + '----------------------------------------');

    var ffmpegCmdStr = ffmpegCmdName + ' -rtsp_transport tcp -i "' + rtspConfig.url + '" -c copy -f flv ' + rtmpUrl;

    // var ffmpegCmdStr = ffmpegCmdName + ' -rtsp_transport tcp -i "' + rtspConfig.url +
    // '" -c copy -b 1080k -r 33 -preset:v ultrafast -tune:v zerolatency -f flv ' + rtmpUrl;

    // var ffmpegCmdStr = ffmpegCmdName + ' -rtsp_transport tcp -i "' + rtspConfig.url +
    //     '" -vcodec libx264 -acodec aac -b 1080k -r 33 -preset:v ultrafast -tune:v zerolatency -f flv ' + rtmpUrl;

    // var ffmpegCmdStr = ffmpegCmdName + ' -i "D:/study/testWebFlv1.1_temp/a.mkv" -vcodec libx264 -acodec aac -b 1080k -r 33 -preset:v ultrafast -tune:v zerolatency -f flv ' + rtmpUrl;

    var cmdStr = rootPath + '&&' +
        'cd ' + newFfmpegPath + '&&' + ffmpegCmdStr;

    //console.error(cmdStr);
    var cmdProcess = childProcess.exec(cmdStr, { maxBuffer: 1 / 0 }, function (err) {
        //子进程中的console.error不会被写入日志文件，所以要把err传递到主进程中去
        var errStr = err ? (err.stack || JSON.stringify(err)) : '';
        err ? (console.error('子进程调用抓取rtsp的命令失败,token：' + token + '，错误信息：' + errStr)) : console.error('子进程调用抓取rtsp的命令成功');
        //进入这个回调时，无论成功还是失败，都已经自动关闭了ffmpeg和cmd进程
        
        process.send({
            p: 2
        });
    });

    return process.send({
        p: 1,
        cmdProcessPid: cmdProcess.pid
    });
});