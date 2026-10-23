import { Ofdh5 } from './ofdh5';
import { OfdError } from './errors';
import { parsePage } from './parser/content';

// 浏览器 script 直引时，window.Ofdh5 既是构造函数（new Ofdh5(...)），
// 也能通过静态属性访问辅助 API（Ofdh5.Ofdh5 / Ofdh5.OfdError / Ofdh5.parsePage）。
Object.assign(Ofdh5, { Ofdh5, OfdError, parsePage });

export default Ofdh5;
