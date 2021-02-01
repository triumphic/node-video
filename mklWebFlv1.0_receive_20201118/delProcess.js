/**删除子进程、ffmpeg进程、cmd进程 */
var childProcess = require('child_process');
var asyncT = require('async');

/**
 * 
 * @param {Object} _obj:{childProcessPid:node子进程的pid，播放时创建的子进程,cmdProcessPid:cmd窗口的进程pid，执行ffmpeg命令时被动创建的,
 *      call:function 删除进程后执行的回调,token:'进程对应的token'}
 */
function start(_obj) {
    _obj = _obj || {};
    var childProcessPid = _obj.childProcessPid;
    var cmdProcessPid = _obj.cmdProcessPid;

    var ffmpegProcessName = _obj.token + '_ffmpeg.exe';
    var getFFmpegProcessCmd = 'tasklist /fi "Imagename eq ' + ffmpegProcessName + '"';

    //获取得到对应的ffmpeg进程
    childProcess.exec(getFFmpegProcessCmd, function (err, stdout, stderr) {
        if (err) {
            delIng({
                childProcessPid: childProcessPid,
                cmdProcessPid: cmdProcessPid,
                token: _obj.token,
                //ffmpegPid: '',
                call: _obj.call
            });
            console.error('----------------------------删除进程,获取' + ffmpegProcessName + '进程时错误----------------------------');
            console.error(err);
            typeof _obj.call == 'function' ? _obj.call : '';
            return;
        }
        console.log('--------------------删除进程,获取' + ffmpegProcessName + '进程成功-----------------------');
        stdout = (stdout || '').trim();
        if (stdout.length == 0) {
             console.log('----------------------------删除进程,获取' + ffmpegProcessName + '进程数为零----------------------------');
             delIng({
                childProcessPid: childProcessPid,
                cmdProcessPid: cmdProcessPid,
                token: _obj.token,
                //ffmpegPid: '',
                call: _obj.call
            });
             typeof _obj.call == 'function' ? _obj.call : '';
             return;
        }
        
        var ffmpegPid;      //ffmpeg进程的pid
        var tempArr = stdout.split('\n');
        for (var i = 0; i < tempArr.length; i++) {
            console.error('--------------------删除进程,第' + i + '次循环，token：' + _obj.token + '--------------------');
            var line = tempArr[i] || '';
            var p = line.trim().split(/\s+/), pname = p[0] || '', pid = parseInt(p[1]);
            if (pname.toLowerCase() == ffmpegProcessName) {
                console.log('--------------------删除进程,进程' + ffmpegProcessName + '的pid为：' + pid + '，token：' + _obj.token + '--------------------');
                ffmpegPid = pid;
                break;
            }
        }
        delIng({
            childProcessPid: childProcessPid,
            cmdProcessPid: cmdProcessPid,
            ffmpegPid: ffmpegPid,
            token: _obj.token,
            call: _obj.call
        });
        return;
    });
}


function delIng(_obj) {
    _obj = _obj || {};
    console.log('--------------------------------------------即将进行删除进程');
    console.log('--------------------------------------------ffmpeg进程为：' + _obj.ffmpegPid);
    console.log('--------------------------------------------cmd窗口进程为：' + _obj.cmdProcessPid);
    console.log('--------------------------------------------node子进程为：' + _obj.childProcessPid);
    var childProcessPid = _obj.childProcessPid;
    var cmdProcessPid = _obj.cmdProcessPid;
    var ffmpegPid = _obj.ffmpegPid;

    try {
        console.error('--------------------------------------------------即将杀死ffmpeg进程' + ffmpegPid + '，token：' + _obj.token);
        if (ffmpegPid)
            process.kill(ffmpegPid);
    } catch (e) {
        console.error('-------------------------删除ffmpeg进程：' + ffmpegPid + '出错' + '，token：' + _obj.token + '-------------------------');
        console.error(e);
    }

    try {
        console.error('--------------------------------------------------即将杀死cmd进程' + cmdProcessPid + '，token：' + _obj.token);
        if (cmdProcessPid)
            process.kill(cmdProcessPid);
    } catch (e) {
        console.error('-------------------------删除cmd进程：' + cmdProcessPid + '出错' + '，token：' + _obj.token + '-------------------------');
        console.error(e);
    }

    try {
        console.error('--------------------------------------------------即将杀死node子进程' + childProcessPid + '，token：' + _obj.token);
        if (childProcessPid)
            process.kill(childProcessPid);
    } catch (e) {
        console.error('-------------------------删除node子进程：' + childProcessPid + '出错' + '，token：' + _obj.token + '-------------------------');
        console.error(e);
    }
    console.log('--------------------------------------------删除进程完成，准备进行回调，token：' + _obj.token);
    if (typeof _obj.call == 'function') _obj.call();
};

module.exports = start;