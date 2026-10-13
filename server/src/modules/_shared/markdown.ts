/**
 * Model-written Markdown, made safe to store and render: text kept, links,
 * images and HTML removed. Shared by the onboarding tour (SPEC-02 AC-12) and the
 * risk brief (SPEC-03 AC-9).
 */

// A link target may hold one level of parentheses: (javascript:alert(1)).
const MD_IMAGE = /!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/g;
const MD_REF_IMAGE = /!\[[^\]]*\]\[[^\]]*\]/g;
const MD_LINK = /\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g;
const MD_REF_LINK = /\[([^\]]+)\]\[[^\]]*\]/g;
const MD_REF_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*\S+.*$/gm;
const AUTOLINK = /<((?:https?|mailto|javascript|data):[^>\s]*)>/gi;
const HTML_TAG = /<\/?[a-z][^>]*>/gi;
/** Script and style blocks go whole — their content is not prose. */
const HTML_BLOCK = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
/** A bare URL or www. host outside a code span — GFM would turn it into a link. */
const BARE_URL = /(`[^`]*`)|((?:https?:\/\/|www\.)[^\s<>`)\]]+)/gi;

/**
 * AC-12: model prose keeps its text, never its links, images or HTML. Bare
 * URLs stay readable as code spans, which Markdown never turns into links.
 */
export function stripLinks(markdown: string): string {
  return markdown
    .replace(HTML_BLOCK, '')
    .replace(MD_IMAGE, '')
    .replace(MD_REF_IMAGE, '')
    .replace(MD_REF_DEFINITION, '')
    .replace(MD_LINK, '$1')
    .replace(MD_REF_LINK, '$1')
    .replace(AUTOLINK, '$1')
    .replace(HTML_TAG, '')
    .replace(BARE_URL, (match, code: string | undefined) => (code ? match : `\`${match}\``))
    .trim();
}
