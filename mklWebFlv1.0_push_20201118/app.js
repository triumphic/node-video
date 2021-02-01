var express = require('public_nodejs/express');
var request = require('public_nodejs/request');
var log4 = require('common/log4logger');
var oriConfigInfo = require('./config');
var routes = require('./routes');

var http = require('http');
var path = require('path');
var fs = require('fs');
var childProcess = require('child_process');

var tempDirName = '_tempfile';     //文件上传的临时目录
var staticDirName = 'public';      //静态资源根目录
var viewDirName = 'views';         //视图文件夹名称

var configInfo = oriConfigInfo.env == 'dev' ? oriConfigInfo.devEnvConfig : oriConfigInfo.proEnvConfig;
var port = configInfo.port;
var dirname = __dirname;
dirname = dirname.replace(/\\/g, '/');

var uploadPath = path.resolve(dirname, './' + staticDirName + '/' + tempDirName).replace(/\\/g, '/');
var staticPath = path.resolve(uploadPath, '../');

global._baseDirname = dirname;
global._config = configInfo;
global._uploadPath = uploadPath;
global._processObj = {};

var app = express();
app.set('views', dirname + '/' + viewDirName);
app.engine('.html', require('public_nodejs/ejs').__express);
app.set('view engine', 'html');

//log4js日志
log4.CreateLog(app, dirname);

app.use(express.bodyParser({ uploadDir: uploadPath }));
app.use(express.methodOverride());
app.use(express.cookieParser());

app.use(app.router);
routes(app);

//静态目录，必须在路由声明之后设定
app.use(express.static(staticPath));

// var ser = http.createServer(app);
// ser.timeout = 1000 * 60 * 30;

// ser.listen(port, function () {
//   console.log('Express server listening on port ' + port);

//   startPush();
// });

startPush();
startIntevalRestart();
startCheckRtsp();

//启动抓流服务，同时往外推流
function startPush() {
  var rtspArr = _config.rtsp;
  var rtmpConfigArr = _config.rtmpConfig;
  var currRtmpConfig = rtmpConfigArr[0];

  rtspArr.forEach(function (currRtsp) {
    (function (_currRtsp, _currRtmpConfig) {
      startChildProcess({
        rtspConfig: _currRtsp,
        rtmpConfig: _currRtmpConfig
      });
    })(currRtsp, currRtmpConfig);
  });
};

/**获取token鉴权认证 */
function getToken(call) {
  var _obj = {
    'userName': 'persagy_vido',
    'password': 'persagy_vido'
  };
  request({
    har: {
      url: _config.tokenServiceUrl + 'persagy_login',
      method: 'POST',
      headers: [{
          name: 'content-type',
          value: 'application/json'
      }],
      postData: {
          mimeType: 'application/json',
          text: JSON.stringify(_obj)
      }
  }
  }, function (err, httpResponse, body) {
    if (err) {
      console.error('认证token时错误');
      console.error(err.stack || err);
      return call({ result: 0 });
    }

    if (httpResponse && httpResponse.statusCode != 200) {
      console.error('认证token时连接后台服务异常');
      console.error(body);
      return call({ result: 0 });
    }

    var responseObj = {};
    try {
      responseObj = typeof body == 'object' ? body : JSON.parse(body);
    } catch (e) {
      responseObj = {};
    } finally {
      var retContent = (responseObj.content || [])[0] || {};
      var token = retContent.token;
      if (!token)
        console.error('获取token失败，原因：' + (responseObj.reason || '未知'));
      call({ result: token ? 1 : 0, key: token });
    }
  });
};

/**告知接收端token */
function sendTokenToReceive(objParam) {
  request.post({
    url: _config.accessDomin + 'vidtk',
    form: {
      'spt': objParam.spToken,
      'rqt': objParam.reqToken
    },
    timeout: 1000 * 60
  }, function (err, httpResponse, body) {
    if (err) {
      console.error('告知接收端token时错误');
      console.error(err.stack || err);
      return objParam.call({ result: 0 });
    }

    if (httpResponse && httpResponse.statusCode != 200) {
      console.error('告知接收端token时连接后台服务异常');
      console.error(body);
      return objParam.call({ result: 0 });
    }

    var responseObj = {};
    try {
      responseObj = typeof body == 'object' ? body : JSON.parse(body);
    } catch (e) {
      responseObj = {};
    } finally {
      if (responseObj.p != 3)
        console.error('--------------告知接收端token时，返回验证失败');
      objParam.call({ result: responseObj.p == 3 ? 1 : 0 });
    }
  });
};


function setRstpConnectState(token, state) {
  global._alarmEquinfo = global._alarmEquinfo || {};
  var _tokeObj = global._alarmEquinfo[token] || {};
  _tokeObj.rtspConnectState = state;
  global._alarmEquinfo[token] = _tokeObj;
};

function startChildProcess(_obj) {
  _obj = _obj || {};
  var rtspConfig = _obj.rtspConfig;
  var rtmpConfig = _obj.rtmpConfig;

  /**--------------------------先去token服务地址获取token----------------------- */
  getToken(function (getTokenResult) {
    getTokenResult = getTokenResult || {};
    if (getTokenResult.result !== 1)
      return setRstpConnectState(rtspConfig.token, 'abort');
    /**--------------------------告知接收端token----------------------- */
    sendTokenToReceive({
      spToken: rtspConfig.token,
      reqToken: getTokenResult.key,
      call: function (sendTResult) {
        sendTResult = sendTResult || {};
        if (sendTResult.result !== 1)
          return setRstpConnectState(rtspConfig.token, 'abort');
          create(getTokenResult.key);
      }
    });
  });

  function create(_key) {
    var cpro = childProcess.fork('./grabRtspChildProcess.js');
    console.log('子进程ID：' + cpro.pid);
    setRstpConnectState(rtspConfig.token, '');

    cpro.send({ rtspConfig: rtspConfig, rtmpConfig: rtmpConfig, _dirname: _baseDirname, cmd: 'start', sign: _key });

    cpro.on('message', function (msgObj) {
      msgObj = msgObj || {};
      if (msgObj.p !== 1) {
        process.kill(cpro.pid);
        msgObj.p == 0 ? console.error('------------------------------------------创建条件不足，创建失败，token：' + rtspConfig.token) :
          console.error('------------------------------------------ffmpeg主动关闭，创建失败，即将触发donePlay事件，token：' + rtspConfig.token);
        if (msgObj.p != 0) {
          //-------------不再进行重启，而是等待故障探测定时检查，可连接时，再进行重启
          // global._alarmEquinfo = global._alarmEquinfo || {};
          // var _tokeObj = global._alarmEquinfo[rtspConfig.token] || {};
          // _tokeObj.rtspConnectState = 'abort';  //中断
          // global._alarmEquinfo[rtspConfig.token] = _tokeObj;
          setRstpConnectState(rtspConfig.token, 'abort');

          // (function (_currRtsp, _currRtmpConfig) {
          //   startChildProcess({
          //     rtspConfig: _currRtsp,
          //     rtmpConfig: _currRtmpConfig
          //   });
          // })(rtspConfig, rtmpConfig);
        }
      } else {
        var token = rtspConfig.token;
        _processObj[token] = _processObj[token] || {};
        _processObj[token].pid = cpro.pid;
        _processObj[token].cmdProcessPid = msgObj.cmdProcessPid;
        console.error('------------------------------------------创建成功，token：' + rtspConfig.token);
      }
    });
  };

};


//开启定时重启进程
function startIntevalRestart() {
  var cpro = childProcess.fork('./freeProcessDist.js');
  console.log('定时重启进程的ID：' + cpro.pid);
  cpro.on('message', function (msgObj) {
    switch (msgObj.command) {
      case 'sel':
        cpro.send({
          processObj: _processObj
        });
        break;
      case 'end':
        _processObj = {};
        startPush();
        break;
    }
  });
  cpro.on('exit', function (code, description) {
    console.error('--------------------定时重启进程退出--------------------：' + description);
    startIntevalRestart();
  });
}

//开启定时检查rtsp流是否可连接的进程
function startCheckRtsp() {
  var cpro = childProcess.fork('./rtspUrlTest.js');
  cpro.on('exit', function (code, description) {
    console.error('--------------------定时检查rtsp流是否可连接的进程退出--------------------：' + description);
    startCheckRtsp();
  });

  cpro.on('message', function (msgObj) {
    //--------------alarmState true代表故障   false代表可用
    msgObj = msgObj || {};
    var token = msgObj.token;
    global._alarmEquinfo = global._alarmEquinfo || {};
    var _tokeObj = global._alarmEquinfo[token] || {};
    switch (msgObj.cmd) {
      case 'sel':
        var alarmState = _tokeObj.alarmState === true ? true : false;
        cpro.send({
          alarmState: alarmState,
          token: token,
          cmd: 'sel_result'
        });
        break;
      case 'update':
        _tokeObj.alarmState = msgObj.newState;
        //如果rtsp流抓取服务断了，但检测rtsp地址发现可用，此时需重启rtsp抓流服务
        if (_tokeObj.rtspConnectState == 'abort' && _tokeObj.alarmState == false) {
          // _tokeObj.rtspConnectState = '';
          var rtspArr = _config.rtsp;
          var currRtmpConfig = _config.rtmpConfig[0];
          var currRtsp;
          for (var i = 0; i < rtspArr.length; i++) {
            var _rtsp = rtspArr[i];
            if (_rtsp.token == token) {
              currRtsp = _rtsp;
              break;
            }
          }

          (function (_currRtsp, _currRtmpConfig) {
            startChildProcess({
              rtspConfig: _currRtsp,
              rtmpConfig: _currRtmpConfig
            });
          })(currRtsp, currRtmpConfig);
        }

        global._alarmEquinfo[token] = _tokeObj;
        // global._alarmEquinfo[token] = msgObj.newState;
        break;
    }
  });
}
