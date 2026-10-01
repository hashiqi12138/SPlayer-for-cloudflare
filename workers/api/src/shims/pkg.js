/**
 * ncm-source/package.json 的替代实现
 *
 * Workers 无法 require JSON 文件，这里只保留被代码引用的字段（version）。
 */
export default { version: '4.40.1' };