/**删除缓存文件 */
var fs = require('fs');
var path = require('path');
/**
 * 
 * @param {缓存文件所属的文件夹路径} dirPath 
 * @param {是否删除目录，默认true} isDelDir 
 */
function start(dirPath, isDelDir) {
    if (!dirPath || !fs.existsSync(dirPath)) return;
    isDelDir = isDelDir === false ? false : true;
    var filesArr = fs.readdirSync(dirPath);
    var fileCount = 0;
    var delFileCount = 0;
    for (var i = 0; i < filesArr.length; i++) {
        var currPath = path.join(dirPath, filesArr[i]);
        var stat = fs.lstatSync(currPath);
        if (stat.isFile() === true) {
            ++fileCount;
            console.log('文件' + currPath + '的连接数' + stat.nlink);
            try {
                fs.unlinkSync(currPath);
                ++delFileCount;
            } catch (e) {
                console.error(e);
            }
        }
    }
    if (isDelDir && fileCount == delFileCount) fs.rmdirSync(dirPath);
}

module.exports = start;