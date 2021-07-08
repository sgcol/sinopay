// 发布在正式环境时需要手工选择export的文件

if (process.env.REACT_APP_CFG) module.exports =require(`./${process.env.REACT_APP_CFG}.js`)
else {
    const fs=require('fs'), path=require('path'), ini =require('ini');
    var {REACT_APP_CFG}=ini.parse(fs.readFileSync(path.join(__dirname, '../.env'), 'utf-8'));
    module.exports=require(`./${REACT_APP_CFG}.js`)
}

// export * from "./indonesia.cfg.js"