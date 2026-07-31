import { readFile, writeFile } from 'node:fs/promises';

const STATUS_URL = 'https://stm37.srvstm.com:6888/7.html';
const RSS_URL = 'https://news.google.com/rss/search?q=Angra+dos+Reis&hl=pt-BR&gl=BR&ceid=BR:pt-BR';
const DATA_FILE = 'data.json';

function decodeEntities(str) {
    if (!str) return '';
    let out = str;
    for (let pass = 0; pass < 2; pass++) {
        out = out
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
            .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)));
    }
    return out;
}

function stripHtml(html) {
    return decodeEntities(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractImage(html) {
    if (!html) return '';
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return m ? m[1] : '';
}

async function getSong() {
    try {
        const res = await fetch(STATUS_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const text = await res.text();
        const body = text.match(/<body>(.*?)<\/body>/i);
        if (body) {
            const parts = body[1].split(',');
            if (parts.length >= 7) return parts.slice(6).join(',').trim();
        }
    } catch (e) {
        console.error('Falha ao buscar musica:', e.message);
    }
    return '';
}

async function getNews() {
    try {
        const res = await fetch(RSS_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const xml = await res.text();
        const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).slice(0, 10);
        const news = items.map(([, body]) => {
            const get = (tag) => {
                const m = body.match(new RegExp('<' + tag + '>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</' + tag + '>'));
                return m ? m[1].trim() : '';
            };
            const desc = get('description');
            const enc = body.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
            const img = enc ? enc[1] : (extractImage(desc) || extractImage(get('content:encoded')));
            return {
                title: decodeEntities(get('title')),
                link: get('link'),
                description: stripHtml(desc).substring(0, 300),
                image: img
            };
        });
        return news.filter(n => n.title && n.link);
    } catch (e) {
        console.error('Falha ao buscar noticias:', e.message);
        return [];
    }
}

async function main() {
    let old = { song: '', news: [] };
    try {
        old = JSON.parse(await readFile(DATA_FILE, 'utf-8'));
    } catch (e) { /* arquivo ainda nao existe */ }

    const song = await getSong() || old.song || '';
    const news = (await getNews()).length > 0 ? await getNews() : old.news;

    const data = {
        updated_at: new Date().toISOString(),
        song,
        news
    };

    const prevRaw = old && old.song === data.song ? JSON.stringify(old) : '';
    const nextRaw = JSON.stringify(data);
    if (prevRaw && prevRaw === nextRaw) {
        console.log('Sem mudancas. data.json mantido.');
        return;
    }

    await writeFile(DATA_FILE, JSON.stringify(data, null, 2) + '\n');
    console.log('data.json atualizado:', JSON.stringify(data.song), '|', data.news.length, 'noticias');
}

main().catch((e) => {
    console.error('Erro fatal:', e);
    process.exit(1);
});
