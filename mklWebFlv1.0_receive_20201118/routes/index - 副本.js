/*路由*/
module.exports = function (app) {
    var delProcess = require('../delProcess');
    var fs = require('fs');
    var path = require('path');
    var childProcess = require('child_process');

    app.all('*', function (req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        next();
    });

    // app.get('*', function (req, res, next) {
    //     //刷新某个摄像头进程的访问时间
    //     var baseName = path.basename(req.url);
    //     if (baseName.indexOf('live.m3u8') == 0) {
    //         var token = req.query.t;
    //         if (token && _rtspProcessObj[token]) {
    //             _rtspProcessObj[token].refershTime = new Date().getTime();
    //         }
    //     }
    //     next();
    // });

    app.get('/', function (req, res, next) {
        res.render('layout.html');
    });

    app.get('/gl', function (req, res, next) {
        res.render('layout_local.html');
    });

    //显示播放页面
    app.get('/flv', function (req, res, next) {
        res.render('layout_flv.html');
    });

    //显示rtmp播放页面
    app.get('/rtmp', function (req, res, next) {
        res.render('layout_rtmp.html');
    });

    //播放flv
    app.post('/playflv', function (req, res, next) {
        var token = req.body.token;
        if (!token) return res.send({ p: 0 });
        var httpIp = req.headers.host.substr(0, req.headers.host.indexOf(':'));
        var _rtmpConfig = _config.rtmpConfig[0];
        return res.send({
            p: 1, url: 'http://' + httpIp + ':' + _rtmpConfig.http.port + '/live/' + token + '.flv',
        });
    });

    //停止播放
    app.post('/stopplay', function (req, res, next) {
        // 该做客户端关闭了，此时：
        //      1、每关闭一个客户端，_allPlayObj变量里的token的数组减少一个
        //      2、_allPlayObj变量里的token的数组长度为零时，杀死进程，但不需要重建
        var currToken = req.body.token;
        var oldTokenPlayNum = _allPlayObj[currToken] || 0;
        console.log('----------------------------------------------------oldTokenPlayNum减之前为：' + oldTokenPlayNum);
        //关闭失败
        if (oldTokenPlayNum == 0)
            return res.send({ r: 0 });
        --oldTokenPlayNum;
        _allPlayObj[currToken] = oldTokenPlayNum;
        console.log('----------------------------------------------------oldTokenPlayNum减之前后：' + oldTokenPlayNum);
        console.log('-----------------------------------------------------停止播放');
        //此时需删除对应的进程
        if (oldTokenPlayNum == 0) {
            var tempObj = _rtspProcessObj[currToken];
            _rtspProcessObj[currToken] = null;
            delete _rtspProcessObj[currToken];
            console.log('-----------------------------------------------------停止播放tempObj：' + JSON.stringify(tempObj));
            delProcess({
                childProcessPid: tempObj.pid,
                cmdProcessPid: tempObj.cmdProcessPid,
                token: currToken,
                call: function () {
                    console.log('-----------------------------------------------------停止播放，删除进程完成');
                    res.send({ r: 1 });
                }
            });
        } else
            res.send({ r: 1 });
    });

    app.get('/getvideo', function (req, res, next) {
        fs.readFile('./a.mp4', function (err, mp4Binary) {
            if (err) return console.error('读取文件错误' + (err.stack || JSON.stringify(err))), res.send();
            res.send(mp4Binary);
        });
    });

    app.get('/vo', function (req, res, next) { });



};
