var config = {
    //开发环境
    devEnvConfig: {
        rtsp: [{
            name: '',
            url: 'rtsp://admin:1234567a@192.168.1.106:554/Streaming/Channels/602',
            token: 'sheb_kj_1'
        }],
        rtmpConfig: [{
            port: '9978',
            host: '219.142.246.231'
        }],
        serviceUrl: '',
        //token认证服务地址
        tokenServiceUrl: 'https://anguana.mmall.com/engineeringSafety-saas-web/Spring/MVC/entrance/unifier/',
        //接收端地址，用于告知接收端token
        accessDomin: 'http://219.142.246.231:8090/'
    },
    //生产环境
    proEnvConfig: {
        rtsp: [{
            name: '摄像头名称，可不配置',
            //摄像头的rtsp流地址
            url: 'rtsp://admin:1234567a@192.168.1.106:554/Streaming/Channels/602',
            //自定义的rtsp流唯一标识，不可重复，用于网页上播放视频
            token: 'sheb_kj_1'
        }],
        rtmpConfig: [{
            //接流端的服务器端口号
            port: '8084',
            //接流端的服务器IP地址
            host: '103.10.2.30'
        }],
        //接收摄像头故障的服务地址
        serviceUrl: 'https://anguan.mmall.com/api/daas/engineeringSafety-saas-web/Spring/MVC/entrance/unifier/video-token-infoPointToMkl',
        //token认证服务地址
        tokenServiceUrl: 'https://anguana.mmall.com/engineeringSafety-saas-web/Spring/MVC/entrance/unifier/',
        //接收端地址，用于告知接收端token
        accessDomin: 'https://anguan.mmall.com/ceshi_3/'
    },
    //环境配置 dev 开发环境    pro 生产环境
    env: 'dev'

};
module.exports = config;