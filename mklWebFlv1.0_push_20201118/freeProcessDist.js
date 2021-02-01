/**
 * 定时轮询，每日凌晨3点杀死所有的ffmpeg进程、运行ffmpeg的cmd窗口进程、运行cmd的node子进程，以进行重启
 */
var childProcess = require('child_process');
var path = require('path');
var asyncT = require('async');
var log4 = require('common/log4logger');
log4.CreateLog(null, path.join(__dirname, 'logs_restart'));
var timeOut = 1000 * 60 * 60;    //60分钟
timer();
function timer() {
    setTimeout(function () {
        if (new Date().getHours() == 3) {
            //获取ffmpeg进程、运行ffmpeg的cmd窗口进程、运行cmd的node子进程信息
            process.send({ command: 'sel' });
        }
    }, timeOut);
};


//除了根据时间间隔判断是否是空闲进程外；要反过来先找到进程，然后逐一往上找父级，进行判断是不是死进程。
//上述两种判断方式看看能不能结合起来
process.on('message', function (msgObj) {
    msgObj = msgObj || {};
    var rtspProcessObj = msgObj.processObj || {};
    start(rtspProcessObj);
});




function start(rtspProcessObj) {
    var proKeys = Object.keys(rtspProcessObj);
    var eachIndex = 0;
    asyncT.whilst(function () {
        return eachIndex < proKeys.length;
    }, function (whileCb) {
        console.error('----------------------------------------杀死进程，第' + eachIndex + '次循环');
        var token = proKeys[eachIndex];
        var ffmpegProcessName = token + '_ffmpeg.exe';
        var getFFmpegProcessCmd = 'tasklist /fi "Imagename eq ' + ffmpegProcessName + '"';
        childProcess.exec(getFFmpegProcessCmd, function (err, stdout, stderr) { 
            if (err) {
                console.error('----------------------------------------杀死进程，获取' + ffmpegProcessName + '进程时错误');
                console.error(err);
                eachIndex = proKeys.length;
                return whileCb();
            }

            stdout = (stdout || '').trim();
            if (stdout.length == 0) {
                console.error('-------------------------杀死进程，没有对应的' + ffmpegProcessName + '进程----------------------');
                eachIndex = proKeys.length;
                return whileCb();
            }
            var tempArr = stdout.split('\n');
            var ffmpegPid;
            for (var i = 0; i < tempArr.length; i++) {
                var line = tempArr[i];
                var p = line.trim().split(/\s+/), pname = p[0], ffmpegPid = p[1];
                if (pname.toLowerCase() == ffmpegProcessName && parseInt(ffmpegPid)) { 
                    console.error('-------------------------杀死进程，' + ffmpegProcessName + '的进程ID是' + ffmpegPid + '----------------------');
                    break;
                }
            }
            var currProObj = rtspProcessObj[token];
            console.error('-------------------------杀死进程，即将执行杀死进程,pid:' + currProObj.pid + '，cmdProcessPid:' + currProObj.cmdProcessPid +
                ',ffmpegPid:' + ffmpegPid + '----------------------');
            delIng({
                childProcessPid: currProObj.pid,
                cmdProcessPid: currProObj.cmdProcessPid,
                ffmpegPid: ffmpegPid
            });
            ++eachIndex;
            whileCb();
        });
    }, function () { 
        console.error('-------------------------杀死进程，执行完毕----------------------');
        timer();
        process.send({ command: 'end' });
    });
}


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
        console.error('杀死进程失败，原因：' + e.message);
    }
};