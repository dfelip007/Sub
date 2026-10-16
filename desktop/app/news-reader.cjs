'use strict';
function readInstagram(document, username) {
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const visibility = new WeakMap();
  function visible(element) {
    if (visibility.has(element)) return visibility.get(element);
    const style = document.defaultView.getComputedStyle(element);
    const result = !element.matches('[hidden],[aria-hidden="true"]') && style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.opacity !== '0' && (!element.parentElement || visible(element.parentElement));
    visibility.set(element, result); return result;
  }
  const path = document.location.pathname;
  if (/\/accounts\/login|\/challenge|\/accounts\/suspended/.test(path) || [...document.querySelectorAll('input[type=password]')].some(visible)) return { status: 'login' };
  if (path.replace(/\/+$/, '') !== `/${username}`) return { status: 'outside' };
  const main = document.querySelector('main,[role="main"]');
  if (!main) return { status: 'unavailable' };
  const owner = [...main.querySelectorAll('h1,h2,header a')].some(element => visible(element) && normalize(element.textContent).replace(/^@/, '') === username);
  if (!owner) return { status: 'unavailable' };
  const notice = [...main.querySelectorAll('h1,h2,h3,p,[role="alert"]')].filter(visible).map(element => normalize(element.textContent)).join(' ').slice(0, 12000);
  if (/conta e privada|account is private|algo deu errado|something went wrong|pagina nao esta disponivel|page isn.t available/.test(notice)) return { status: 'unavailable' };
  const items = [], keys = new Set();
  const grid = main.querySelector('article') || main;
  for (const link of grid.querySelectorAll('a[href]')) {
    if (!visible(link)) continue;
    let url; try { url = new URL(link.getAttribute('href'), document.location.href); } catch { continue; }
    if (!['www.instagram.com', 'instagram.com'].includes(url.hostname) || url.protocol !== 'https:') continue;
    const match = url.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]{1,80})\/?$/);
    if (!match) continue;
    const key = `${match[1]}:${match[2]}`;
    if (keys.has(key)) continue;
    keys.add(key); items.push({ key, kind: match[1] === 'p' ? 'post' : 'reel', url: `https://www.instagram.com/${match[1]}/${match[2]}/` });
    if (items.length === 12) break;
  }
  let story = 'unknown';
  // Only a specific story ID identifies new content. A generic /stories/user/
  // link does not prove a new story and must never become a "new story" alert.
  for (const link of main.querySelectorAll('a[href]')) {
    if (!visible(link)) continue;
    let url; try { url = new URL(link.getAttribute('href'), document.location.href); } catch { continue; }
    if (!['www.instagram.com', 'instagram.com'].includes(url.hostname) || url.protocol !== 'https:') continue;
    const match = url.pathname.match(new RegExp(`^/stories/${username}/([0-9]{1,30})/?$`));
    if (!match) continue;
    story = 'identified'; const key = `story:${match[1]}`;
    if (!keys.has(key)) { keys.add(key); items.push({ key, kind: 'story', url: `https://www.instagram.com/stories/${username}/${match[1]}/` }); }
  }
  if (!items.length && !/\b0 (?:publicacoes|posts)\b|no posts yet|nenhuma publicacao ainda/.test(notice)) return { status: 'unavailable' };
  return { status: 'ok', items: items.slice(0, 30), story };
}
module.exports = { readInstagram };
