import { readFile, writeFile } from 'node:fs/promises';

const STATUS_URL = 'https://sv15.hdradios.net:8914/7.html';
const API_URL = 'https://painel.hdradios.net/api-json/VkRCU2NtVkZOVUpRVkRBOStS';
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

async function getRadioInfo() {
    try {
        const res = await fetch(API_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const buffer = await res.arrayBuffer();
        let text = new TextDecoder('utf-8').decode(buffer);
        if (text.indexOf('\uFFFD') !== -1) {
            text = new TextDecoder('iso-8859-1').decode(buffer);
        }
        const data = JSON.parse(text);
        return {
            song: typeof data.musica_atual === 'string' && data.musica_atual.trim() ? decodeEntities(data.musica_atual.trim()) : '',
            listeners: data.ouvintes_conectados || '',
            cover: data.capa_musica || '',
            next: (data.proxima_musica && typeof data.proxima_musica === 'object' && !Array.isArray(data.proxima_musica) && data.proxima_musica.title) ? data.proxima_musica.title : ''
        };
    } catch (e) {
        console.error('Falha ao buscar API:', e.message);
    }
    try {
        const res = await fetch(STATUS_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const text = await res.text();
        const body = text.match(/<body>(.*?)<\/body>/i);
        if (body) {
            const parts = body[1].split(',');
            if (parts.length >= 7) {
                const song = decodeEntities(parts.slice(6).join(',').trim());
                return { song, listeners: '', cover: '', next: '' };
            }
        }
    } catch (e) {
        console.error('Falha ao buscar musica (7.html):', e.message);
    }
    return { song: '', listeners: '', cover: '', next: '' };
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

    const info = await getRadioInfo();
    const song = info.song || old.song || '';
    const fetchedNews = await getNews();
    const news = fetchedNews.length > 0 ? fetchedNews : old.news;

    const data = {
        updated_at: new Date().toISOString(),
        song,
        listeners: info.listeners || old.listeners || '',
        cover: info.cover || old.cover || '',
        next: info.next || old.next || '',
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
