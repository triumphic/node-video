var NodeMediaServer = require('public_nodejs/node-media-server');
var express = require('public_nodejs/express');
var log4 = require('common/log4logger');
var oriConfigInfo = require('./config');
var routes = require('./routes');
var delProcess = require('./delProcess');

var http = require('http');
var path = require('path');
var fs = require('fs');
var _url = require('url');
var childProcess = require('child_process');
const { time } = require('console');

var tempDirName = '_tempfile';     //文件上传的临时目录
var staticDirName = 'public';      //静态资源根目录
var viewDirName = 'views';         //视图文件夹名称


function appendZero(val) {
  return val < 10 ? '0' + val : val.toString();
};

/*默认格式y/M/d    y 完整年份    M 带零的月份   d 带零的日    h 带零的小时    m 带零的分钟   s 带零的秒*/
Date.prototype.format = function (formatter) {
  if (!formatter || formatter == "") {
      formatter = "y/M/d";
  }
  var year = '', month = '', day = '', hour = '', minute = '', second = '';

  var yearMarker = formatter.replace(/[^y]/g, '');
  if (yearMarker) year = this.getFullYear().toString();

  var monthMarker = formatter.replace(/[^M]/g, '');
  if (monthMarker) month = appendZero(this.getMonth() + 1);

  var dayMarker = formatter.replace(/[^d]/g, '');
  if (dayMarker) day = appendZero(this.getDate());

  var hourMarker = formatter.replace(/[^h]/g, '');
  if (hourMarker) hour = appendZero(this.getHours());

  var minuteMarker = formatter.replace(/[^m]/g, '');
  if (minuteMarker) minute = appendZero(this.getMinutes());

  var secondMarker = formatter.replace(/[^s]/g, '');
  if (secondMarker) second = appendZero(this.getSeconds());

  return formatter.replace(yearMarker, year).replace(monthMarker, month).replace(dayMarker, day)
      .replace(hourMarker, hour).replace(minuteMarker, minute).replace(secondMarker, second);
};

var configInfo = oriConfigInfo.env == 'dev' ? oriConfigInfo.devEnvConfig : oriConfigInfo.proEnvConfig;

var port = configInfo.port;
var dirname = __dirname;
dirname = dirname.replace(/\\/g, '/');

var uploadPath = path.resolve(dirname, './' + staticDirName + '/' + tempDirName).replace(/\\/g, '/');
var staticPath = path.resolve(uploadPath, '../');

global._baseDirname = dirname;
global._config = configInfo;
global._uploadPath = uploadPath;
global._rtspConfigInfo = configInfo.rtsp;
global._rtspProcessObj = {};
global._allPlayObj = {};
global._hlsCacheDir = configInfo.fileCachDir || path.join(__dirname, staticDirName, 'video');
global._fileUploadServiceUrl = configInfo.fileService.url + configInfo.fileService.uploadFnName + '?' + configInfo.fileService.defaultParam + '&key=';
global._fileDownServiceUrl = configInfo.fileService.url + configInfo.fileService.downFnName + '?' + configInfo.fileService.defaultParam + '&key=';

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

var ser = http.createServer(app);
ser.timeout = 1000 * 60 * 30;

ser.listen(port, function () {
  console.log('Express server listening on port ' + port);
  var _configArr = _config.rtmpConfig instanceof Array ? _config.rtmpConfig : [_config.rtmpConfig];

  _configArr.forEach(function (currConfig) {
    (function (_rtmpConfig) {
      var nms = new NodeMediaServer(_rtmpConfig);
      nms.run();

      /**
       * preConnect postConnect prePublish postPublish   此4个事件依次走完，代表有推送的流过来了
       * donePublish doneConnect 依次走完，代表推送流断开了
       * preConnect postConnect prePlay postPlay  依次走完，代表http播放flv连接上了
       * donePlay doneConnect  依次走完，代表http播放flv断开连接了
       */

      nms.on('preConnect', (id, args) => {
        console.log('----------------------------[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);
        // let session = nms.getSession(id);
        // session.reject();
        global._streamObj = global._streamObj || {};
        if (global._streamObj[id])
          global._streamObj[id].preConnect = false;
        else { 
          global._streamObj[id] = { preConnect: true };
        }
      });
      
      nms.on('postConnect', (id, args) => {
        console.log('----------------------------[NodeEvent on postConnect]', `id=${id} args=${JSON.stringify(args)}`);
        // let session = nms.getSession(id);
        global._streamObj = global._streamObj || {};
        global._streamObj[id] = global._streamObj[id] || {};

        var postConnectVal = !global._streamObj[id].preConnect ? false : true;
        global._streamObj[id].postConnect = postConnectVal;
      });
      
      nms.on('doneConnect', (id, args) => {
        console.log('----------------------------[NodeEvent on doneConnect]', `id=${id} args=${JSON.stringify(args)}`);
        global._streamObj = global._streamObj || {};
        global._streamObj[id] = global._streamObj[id] || {};

        var doneConnectVal = !global._streamObj[id].donePublish ? false : true;
        global._streamObj[id].doneConnect = doneConnectVal;
        //代表推流断开了
        if (global._streamObj[id].donePublish === true && doneConnectVal === true) { 
          global._streamObj[id] = null;
          delete global._streamObj[id];
        }
      });
      
      nms.on('prePublish', (id, StreamPath, args) => {
        console.log('----------------------------[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
        //-------------在此步用args.sign取得传过来的sign值和缓存的sign进行对比
        let session = nms.getSession(id);
        args = args || {};
        var _tempArr= StreamPath.split('/');
        var token = _tempArr[_tempArr.length - 1] || '';
        global._reqTokenObj = global._reqTokenObj || {};
                // global._reqTokenObj[spToken] = reqToken;
        if (!args.sign || !global._reqTokenObj[token] || args.sign != global._reqTokenObj[token])
          session.reject();   //拒绝连接

        global._streamObj = global._streamObj || {};
        global._streamObj[id] = global._streamObj[id] || {};

        var prePublishVal = global._streamObj[id].preConnect === true && global._streamObj[id].postConnect === true ? true : false;
        global._streamObj[id].prePublish = prePublishVal;
      });
      
      nms.on('postPublish', (id, StreamPath, args) => {
        console.log('----------------------------[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
        // let session = nms.getSession(id);
        global._streamObj = global._streamObj || {};
        global._streamObj[id] = global._streamObj[id] || {};

        var postPublishhVal = global._streamObj[id].preConnect === true && global._streamObj[id].postConnect === true && global._streamObj[id].prePublish === true ? true : false;
        global._streamObj[id].postPublish = postPublishhVal;
        //有推流过来的时候，创建获取flv同时转为hls的进程
        if (postPublishhVal) { 
          var _rtmpConfigArr = _config.rtmpConfig instanceof Array ? _config.rtmpConfig : [_config.rtmpConfig];
          var httpPort = _rtmpConfigArr[0].http.port;
          var _tempArr= StreamPath.split('/');
          var token = _tempArr[_tempArr.length - 1] || '';
          if (!token) { 
            console.error('-------------------------推流成功，无法获取到token，id：' + id + '，StreamPath：' + StreamPath);
            return;
          }
          startPush({
            token: token,
            httpPort: httpPort,
            streamId: id
          });
        }
      });
      
      nms.on('donePublish', (id, StreamPath, args) => {
        console.log('----------------------------[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
        global._streamObj = global._streamObj || {};
        global._streamObj[id] = global._streamObj[id] || {};
        global._streamObj[id].donePublish = true;
      });
      
      nms.on('prePlay', (id, StreamPath, args) => {
        console.log('----------------------------[NodeEvent on prePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
        // let session = nms.getSession(id);
        // session.reject();
      });
      
      nms.on('postPlay', (id, StreamPath, args) => {
        console.log('----------------------------[NodeEvent on postPlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
      });
      
      nms.on('donePlay', (id, StreamPath, args) => {
        console.log('----------------------------[NodeEvent on donePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
      });


    })(currConfig);
  });
  
  // childProcess.fork('./clearTsCache');
  startInvervalClear();
});


//启动同步服务
function startDataTb() {
  var cpro = childProcess.fork('./intervalUploadHls_one.js');
  console.log('同步数据进程的ID：' + cpro.pid);
  cpro.on('message', function (msgObj) {
    switch (msgObj.command) {
      case 'sel':
        cpro.send({
          cmd: 'upload',
          liveInfoObj: global.liveInfoObj
        });
        break;
    }
  });
  cpro.on('exit', function (code, description) {
    console.error('--------------------同步数据进程退出--------------------：' + description);
    startDataTb();
  });
};


//开启定时清除缓存程序
function startInvervalClear() {
  var cpro = childProcess.fork('./clearTsCache.js');
  console.log('定时清除进程的ID：' + cpro.pid);
  cpro.on('exit', function (code, description) {
    console.error('--------------------定时清除进程退出--------------------：' + description);
    startInvervalClear();
  });
}


//启动抓流服务
function startPush(_obj) {
  startChildProcess(_obj);
};

/**
 * 推流端断开大概2分钟后，ffmpeg会自动关闭，此时进程关闭，并进入回调函数，此时不需要重启
 * ffmpeg遇到错误关闭时，会进入回调，此时需重启
 */
function startChildProcess(_obj) {
  _obj = _obj || {};
  //每个token下的创建时间是唯一的，即作为存放碎片文件的目录，也作为上传碎片文件时的标识
  var createTime = new Date().format('yMdhms');
  var cpro = childProcess.fork('./grabRtspChildProcess.js');
  console.log('子进程ID：' + cpro.pid);
  cpro.send({ _obj: _obj, _dirname: global._baseDirname, _hlsCacheDir: global._hlsCacheDir, _currTime: createTime});

  cpro.on('message', function (msgObj) {
    msgObj = msgObj || {};
    if (msgObj.p !== 1) {
      process.kill(cpro.pid);
      msgObj.p == 0 ? console.error('------------------------------------------创建条件不足，创建失败，token：' + _obj.token) :
        console.error('------------------------------------------ffmpeg主动关闭，创建失败，token：' + _obj.token);

      var streamId = _obj.streamId;
      if (streamId) { 
        global._streamObj = global._streamObj || {};
        var _tempObj = (global._streamObj || {})[streamId] || {};
        if (_tempObj.preConnect === true && _tempObj.postConnect === true && _tempObj.prePublish === true && _tempObj.postPublish === true) { 
          //此时说明是创建ffmpeg的时候出的错，需要重建
          startPush(_obj);
        }
      }
    } else {
      var token = _obj.token;
      global.liveInfoObj = global.liveInfoObj || {};
      global.liveInfoObj[token] = global.liveInfoObj[token] || {};
      // global.liveInfoObj[token].time = createTime;
      global.liveInfoObj[token] = { time: createTime, uploadIndex: -1 };
      // global._processObj[token] = global._processObj[token] || {};
      // global._processObj[token].pid = cpro.pid;
      // global._processObj[token].cmdProcessPid = msgObj.cmdProcessPid;
      console.error('------------------------------------------创建成功，token：' + token);
      // var waitUploadObj = global._waitUploadObj || {};
      // if (!waitUploadObj[token]) waitUploadObj[token] = {};
      // waitUploadObj[token][createTime] = {};
      // waitUploadObj[token][createTime].uploadIndex = -1;
      // waitUploadObj[token].useingTime = createTime;
      // global._waitUploadObj = waitUploadObj;

      // if (!isStartUpload) {
      //   isStartUpload = true;
      //   // intervalUploadHls();
      //   //开启上传进程
      //   startUpload();
      // }
    }
  });
};

