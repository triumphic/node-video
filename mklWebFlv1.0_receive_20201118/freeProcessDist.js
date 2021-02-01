/**删除子进程、ffmpeg进程、cmd进程 */
var childProcess = require('child_process');
var asyncT = require('async');

/**
 * 
 * @param {Object} _obj:{childProcessPid:node子进程的pid，播放时创建的子进程；cmdProcessPid:cmd窗口的进程pid，执行ffmpeg命令时被动创建的；token
 *      }
 */
function start(_obj) {
    _obj = _obj || {};
    var childProcessPid = _obj.childProcessPid;
    var cmdProcessPid = _obj.cmdProcessPid;

    var ffmpegProcessName = 'ffmpeg.exe';
    var getFFmpegProcessCmd = 'tasklist /fi "Imagename eq ' + ffmpegProcessName + '"';

    //获取得到所有的ffmpeg进程
    childProcess.exec(getFFmpegProcessCmd, function (err, stdout, stderr) {
        if (err) {
            delIng({
                childProcessPid: childProcessPid,
                cmdProcessPid: cmdProcessPid,
                dirPath: _obj.dirPath,
                isDelDir: _obj.isDelDir,
                call: _obj.call
            });
            console.error('获取ffmpeg进程时错误');
            return console.error(err);
        }
        console.log('--------------------获取所有的ffmpeg进程成功-----------------------');
        stdout = (stdout || '').trim();
        if (stdout.length == 0) return delIng({
            childProcessPid: childProcessPid,
            cmdProcessPid: cmdProcessPid,
            dirPath: _obj.dirPath,
            isDelDir: _obj.isDelDir,
            call: _obj.call
        });
        var ffmpegPid;      //ffmpeg进程的pid
        var tempArr = stdout.split('\n');
        var eachIndex = 0;
        asyncT.whilst(function () {
            return eachIndex < tempArr.length;
        }, function (whileCb) {
                console.log('第' + eachIndex + '次循环');
            var line = tempArr[eachIndex];
            ++eachIndex;
            var p = line.trim().split(/\s+/), pname = p[0], pid = p[1];
            if (pname.toLowerCase() == ffmpegProcessName && parseInt(pid)) {
                console.log('开始获取进程' + pid + '的父进程');
                //获取某一个ffmpeg进程的父级进程的pid
                var getPpidCmdStr = 'wmic process where ProcessId=' + pid + ' get ParentProcessId';
                childProcess.exec(getPpidCmdStr, function (err2, stdout2, stderr2) {
                    console.log('进程' + pid + '的父进程信息为' + stdout2);
                    if (err2) {
                        console.error('获取' + pid + '的父进程时错误');
                        console.error(err2);
                    } else {
                        console.error('获取' + pid + '的父进程成功');
                        stdout2 = (stdout2 || '').trim();
                        var tempArr2 = stdout2.split('\n');
                        for (var i = 0; i < tempArr2.length; i++) {
                            var tt = tempArr2[i].trim();
                            if (tt == cmdProcessPid) {
                                ffmpegPid = pid;
                                eachIndex = tempArr.length;
                            }
                        }
                    }
                    whileCb();
                });
            } else {
                whileCb();
            }
        }, function (whileErr) {
            if (whileErr) {
                console.error('执行whilst错误');
                console.error(whileErr);
            }
            delIng({
                childProcessPid: childProcessPid,
                cmdProcessPid: cmdProcessPid,
                ffmpegPid: ffmpegPid,
                dirPath: _obj.dirPath,
                isDelDir: _obj.isDelDir,
                call: _obj.call
            });
        });
    });
}


function delIng(_obj) {
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

    if (typeof _obj.dirPath == 'string')
        delFiles(_obj.dirPath, _obj.isDelDir);
    if (typeof _obj.call == 'function') _obj.call();
};

module.exports = start;