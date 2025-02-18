function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<');
}

module.exports = { decodeHtmlEntities };