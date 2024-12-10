/**
 * 根据 dec 将整数金额扩展为符合格式的数字
 * @param {string | number} amount - 输入的金额，例如 "123456" 或 "123.456"
 * @param {number} dec - 小数位数，例如 8
 * @returns {string} 转换后的字符串金额
 */

function formatAmount(amount, dec) {
    const [intPart, decPart = ""] = amount.toString().split(".");
    const expandedDecPart = decPart.padEnd(dec, "0");
    return intPart + expandedDecPart;
}

/**
 * 根据 dec 将扩展后的数字还原为带小数点的金额
 * @param {string} amount - 输入的扩展金额，例如 "12345600000000"
 * @param {number} dec - 小数位数，例如 8
 * @returns {string} 转换后的字符串金额
 */
function parseAmount(amount, dec) {
    const paddedAmount = amount.padStart(dec + 1, "0");
    const intPart = paddedAmount.slice(0, -dec);
    const decPart = paddedAmount.slice(-dec);
    return decPart === "0".repeat(dec) ? intPart : `${intPart}.${decPart}`;
}
export { formatAmount, parseAmount };
