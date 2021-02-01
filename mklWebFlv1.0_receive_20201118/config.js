var config = {
    //开发环境
    devEnvConfig: {
        port: 8090,       //播放、裁剪的端口 http
        //视频碎片、报警视频缓存目录。
        fileCachDir: 'D:/Project/web/美凯龙摄像头定制/video_cache',
        //虚拟的缓存目录数组
        vitrualCacheDirs: ['D:/Project/web/美凯龙摄像头定制/video_cache','D:/Project/web/美凯龙摄像头定制/video_cache'],
        //用于访问直播和报警视频
        // accessDomin: 'https://anguan.mmall.com/ceshi_3/',
        accessDomin: 'http://219.142.246.231:8090/',
        //用于获取不能删除的碎片时间
        serviceUrl: 'http://anguan.mmall.com/api/daas/engineeringSafety-saas-web-zsc/Spring/MVC/entrance/unifier/video-cleartimegt',
        //用于上传报警视频
        fileService: {
            url: 'http://192.168.100.107:9909/image-service/common/',
            uploadFnName: 'file_upload',
            downFnName: 'file_get',
            defaultParam: 'systemId=dataPlatform&secret=9e0891a7a8c8e885'
        },
        //用于token鉴权认证
        tokenServiceUrl: 'https://anguana.mmall.com/engineeringSafety-saas-web/Spring/MVC/entrance/unifier/',
        rtmpConfig: [{
            rtmp: {
                port: 9978,         //本地服务器推送flv流的端口
                chunk_size: 60000,
                gop_cache: true,
                ping: 60,
                ping_timeout: 30
            },
            //访问flv的http端口号
            http: {
                port: 84,       //ffmpeg访问flv的端口，以抓取flv转成hls   本机使用
                allow_origin: '*'
            },
            // auth: {
            //     play: false, //表示拉流的时候是开启鉴权验证
            //     publish: true, //表示推流的时候开启鉴权验证
            //     secret: 'br_mkl_2020_video'
            // }
        }]
    },
    //生产环境
    proEnvConfig: {
        //播放、裁剪视频的端口 http
        port: 83,
        //视频碎片、报警视频缓存目录。
        fileCachDir: '/data/video_cache',
        //虚拟的缓存目录数组
        vitrualCacheDirs: [{
            virtualDir: '/flv/flv_data1/data',
            nfsIp: '172.16.46.36',
            nfsPort: '2049'
        },{
            virtualDir: '/flv/flv_data2/data',
            nfsIp: '172.16.46.35',
            nfsPort: '2049'
        }],
        //用于访问直播和报警视频的域名
        accessDomin: 'https://anguan.mmall.com/ceshi_3/',
        //用于获取不能删除的碎片时间
        serviceUrl: 'https://anguan.mmall.com/api/daas/engineeringSafety-saas-web/Spring/MVC/entrance/unifier/video-cleartimegt',
        //用于上传报警视频
        fileService: {
            url: 'https://anguana.mmall.com/image-service/common/',
            uploadFnName: 'file_upload',
            downFnName: 'file_get',
            defaultParam: 'systemId=dataPlatform&secret=9e0891a7a8c8e885'
        },
        //用于token鉴权认证
        tokenServiceUrl: 'https://anguana.mmall.com/engineeringSafety-saas-web/Spring/MVC/entrance/unifier/',
        rtmpConfig: [{
            //接收视频推流的配置，只需要修改端口号即可，其他默认
            rtmp: {
                port: 9920,
                chunk_size: 60000,
                gop_cache: true,
                ping: 60,
                ping_timeout: 30
            },
            //本机访问flv的http端口号，用于把flv转为hls
            http: {
                port: 84,
                allow_origin: '*'
            },
            // auth: {
            //     play: false, //表示拉流的时候是开启鉴权验证
            //     publish: true, //表示推流的时候开启鉴权验证
            //     secret: 'br_mkl_2020_video'
            // }
        }]
    },
    //环境配置 dev 开发环境    pro 生产环境
    env: 'dev'
};
module.exports = config;