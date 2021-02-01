1、接收端和推送端的config.js里一定要改成开发环境，生产环境连的是美凯龙的，本机不要连
2、接收端和推送端主要就是grabRtspChildProcess.js
3、接收端额外的使用了node-media-server
4、接收端、推送端都使用了ffmpeg对视频进行操作，如抓取rtsp流、裁剪视频