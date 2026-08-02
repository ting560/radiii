(function () {
    'use strict';

    const STREAM_URL = "https://sv15.hdradios.net:8914/stream";
    const API_URL = "https://painel.hdradios.net/api-json/VkRCU2NtVkZOVUpRVkRBOStS";
    const CURRENT_SONG_URL = "https://player.hdradios.net/proxy-cors/8914/currentsong/https://sv15.hdradios.net:8914/currentsong?sid=1";
    const RSS_URL = "https://news.google.com/rss/search?q=Angra+dos+Reis&hl=pt-BR&gl=BR&ceid=BR:pt-BR";
    const PLACEHOLDER_IMG = 'https://z-cdn-media.chatglm.cn/files/eb57e8a7-8c37-4c67-9360-a6955a9a7495.png?auth_key=1872979742-b9c0fa04281e42cd9758535b515671cb-0-24c3f66193992b40a4ff51135bf319a4';

    const audioPlayer = new Audio(STREAM_URL);
    audioPlayer.crossOrigin = "anonymous";
    audioPlayer.preload = "auto";
    audioPlayer.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px;opacity:0.01";
    document.body.appendChild(audioPlayer);

    audioPlayer.addEventListener('error', function () {
        isPlaying = false;
        document.getElementById('iconPlay').className = 'fas fa-play';
        showToast('Erro ao reproduzir a r\u00e1dio. Verifique a conex\u00e3o.');
    });

    audioPlayer.addEventListener('waiting', function () {
        if (isPlaying && Date.now() - lastWaitingToast > 5000) {
            lastWaitingToast = Date.now();
            showToast('Carregando transmiss\u00e3o...');
        }
    });

    let newsItems = [];
    let weatherData = null;
    let currentSong = "";
    let songUpdateInterval = null;
    let isPlaying = false;
    let songHistory = [];
    let carouselIndex = 0;
    let carouselTimer = null;
    let audioCtx = null;
    let analyser = null;
    let source = null;
    let dataArray = null;
    let visualizerReady = false;
    let showOpenOnly = false;
    let lastVolume = 0.8;
    let dataUpdateInterval = null;
    let lastWaitingToast = 0;

    const topHeader = document.getElementById('topHeader');
    const fixedPlayer = document.getElementById('fixedPlayer');
    const playerWrapper = document.getElementById('playerWrapper');
    const fixedPlayIcon = document.getElementById('fixedBtnPlay').querySelector('i');

    // HEADER SCROLL
    window.addEventListener('scroll', function () {
        if (window.scrollY > 50) {
            topHeader.classList.add('scrolled');
        } else {
            topHeader.classList.remove('scrolled');
        }
    });

    // FIXED PLAYER ON SCROLL
    var playerObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            fixedPlayer.classList.toggle('visible', !entry.isIntersecting);
        });
    }, { threshold: 0 });
    playerObserver.observe(playerWrapper);

    document.getElementById('fixedBtnMute').addEventListener('click', function () {
        document.getElementById('btnMute').click();
    });
    document.getElementById('fixedBtnPlay').addEventListener('click', function () {
        document.getElementById('btnPlayPause').click();
    });

    function syncFixedPlayer() {
        document.getElementById('fixedSongTitle').textContent = document.getElementById('songTitle').textContent;
        document.getElementById('fixedSongArtist').textContent = document.getElementById('songArtist').textContent;
        fixedPlayIcon.className = document.getElementById('iconPlay').className;
    }
    setInterval(syncFixedPlayer, 1000);

    // VISUALIZER
    var canvas = document.getElementById('visualizer-canvas');
    var ctx = canvas.getContext('2d');

    function initAudioVisualizer() {
        if (visualizerReady) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();

            function connectViz() {
                if (source) {
                    try { source.disconnect(); } catch (e) { }
                }
                analyser = audioCtx.createAnalyser();
                source = audioCtx.createMediaElementSource(audioPlayer);
                var comp = audioCtx.createDynamicsCompressor();
                comp.threshold.value = -24;
                comp.knee.value = 30;
                comp.ratio.value = 12;
                comp.attack.value = 0.003;
                comp.release.value = 0.25;
                var hp = audioCtx.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = 30;
                source.connect(hp);
                hp.connect(comp);
                comp.connect(analyser);
                analyser.connect(audioCtx.destination);
                analyser.fftSize = 256;
                dataArray = new Uint8Array(analyser.frequencyBinCount);
                visualizerReady = true;
                drawVisualizer();
            }

            if (audioCtx.state === 'suspended') {
                audioCtx.resume().then(connectViz).catch(function () { });
            } else {
                connectViz();
            }
        } catch (e) { }
    }

    function drawVisualizer() {
        requestAnimationFrame(drawVisualizer);
        if (!isPlaying || !visualizerReady) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }
        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        var barWidth = (canvas.width / dataArray.length) * 2.5;
        var x = 0;

        for (var i = 0; i < dataArray.length; i++) {
            var barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
            var intensity = dataArray[i] / 255;
            var r = Math.floor(0 + (243 - 0) * intensity);
            var g = Math.floor(200 + (112 - 200) * intensity);
            var b = Math.floor(81 + (33 - 81) * intensity);
            ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.3 + intensity * 0.5) + ')';
            ctx.beginPath();
            ctx.roundRect(x, canvas.height - barHeight, barWidth - 1, barHeight, [4, 4, 0, 0]);
            ctx.fill();
            x += barWidth;
        }
    }

    // HISTORY
    function addToHistory(artist, title) {
        var now = new Date();
        var timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        if (songHistory.length > 0 && songHistory[0].title === title && songHistory[0].artist === artist) return;
        songHistory.unshift({ artist: artist, title: title, time: timeStr });
        if (songHistory.length > 5) songHistory.pop();
        renderHistory();
    }

    function renderHistory() {
        var historyList = document.getElementById('songHistory');
        if (songHistory.length === 0) {
            historyList.innerHTML = '<li class="history-item" style="opacity:0.5;justify-content:center;"><span style="color:#888;font-size:.85rem;">O hist\u00f3rico aparecer\u00e1 aqui...</span></li>';
            return;
        }
        var html = '';
        for (var i = 0; i < songHistory.length; i++) {
            var item = songHistory[i];
            var safeTitle = escapeHtml(item.title);
            var safeArtist = escapeHtml(item.artist);
            html += '<li class="history-item"><span class="history-time">' + item.time + '</span><div class="history-info"><div class="history-song">' + safeTitle + '</div><div class="history-artist">' + safeArtist + '</div></div></li>';
        }
        historyList.innerHTML = html;
    }

    // ESCAPE HTML TO PREVENT XSS
    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // GET SONG + NEWS - via data.json (gerado por GitHub Actions, sem CORS)
    var DATA_URL = "data.json";
    var SHOUTCAST_STATUS_URL = "https://sv15.hdradios.net:8914/7.html";

    function applySong(musicaAtual) {
        currentSong = musicaAtual;
        var artist = "R\u00e1dio Positiva";
        var title = musicaAtual;
        var separators = [' - ', ' \u2013 ', '-', '\u2013', ' | ', '|', ' by '];
        for (var s = 0; s < separators.length; s++) {
            var sep = separators[s];
            if (musicaAtual.indexOf(sep) !== -1) {
                var parts = musicaAtual.split(sep);
                if (parts.length >= 2) {
                    artist = parts[0].trim();
                    title = parts.slice(1).join(sep).trim();
                    break;
                }
            }
        }
        document.getElementById('songTitle').textContent = title;
        document.getElementById('songArtist').textContent = artist;
        addToHistory(artist, title);
    }

    async function fetchRadioData() {
        try {
            var res = await fetch(DATA_URL + '?_=' + Date.now());
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var data = await res.json();
            if (data.news && Array.isArray(data.news) && data.news.length > 0) {
                newsItems = data.news;
                renderNewsTicker();
                renderCarousel();
            }
        } catch (e) {
            console.warn('data.json indispon\u00edvel, usando fallback direto:', e);
            fetchCurrentSongFallback();
            fetchRSSNewsFallback();
        }
    }

    function fetchCurrentSong() {
        fetchRadioData();
    }

    async function fetchApiJson() {
        var apiRes = await fetch(API_URL + '?_=' + Date.now(), { method: 'GET', headers: { 'Accept': 'application/json' }, mode: 'cors' });
        if (!apiRes.ok) throw new Error('HTTP ' + apiRes.status);
        var buffer = await apiRes.arrayBuffer();
        var text = new TextDecoder('utf-8').decode(buffer);
        if (text.indexOf('\uFFFD') !== -1) {
            text = new TextDecoder('iso-8859-1').decode(buffer);
        }
        return JSON.parse(text);
    }

    async function fetchLiveSong() {
        try {
            var res = await fetch(CURRENT_SONG_URL + '?_=' + Date.now(), { mode: 'cors' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var buffer = await res.arrayBuffer();
            var text = new TextDecoder('utf-8').decode(buffer);
            if (text.indexOf('\uFFFD') !== -1) {
                text = new TextDecoder('iso-8859-1').decode(buffer);
            }
            var musicaAtual = text.replace(/\s+/g, ' ').trim();
            if (musicaAtual && musicaAtual !== '-' && musicaAtual !== '' && musicaAtual !== currentSong) {
                applySong(musicaAtual);
            }
        } catch (e) {
            console.warn('Falha ao buscar musica ao vivo', e);
        }
    }

    function displayListeners(real) {
        var n = parseInt(real, 10);
        if (isNaN(n) || n < 10) {
            return Math.floor(Math.random() * 7) + 4;
        }
        return n;
    }

    async function fetchLiveInfo() {
        try {
            var data = await fetchApiJson();
            var listenersEl = document.getElementById('listenerCount');
            if (listenersEl && data.ouvintes_conectados) {
                listenersEl.textContent = displayListeners(data.ouvintes_conectados);
            }
        } catch (e) {
            console.warn('API hdradios indispon\u00edvel', e);
        }
    }

    async function fetchCurrentSongFallback() {
        var musicaAtual = "";
        var ouvintes = "";
        try {
            var apiData = await fetchApiJson();
            musicaAtual = apiData.musica_atual || apiData.musica || apiData.currentSong || apiData.song || apiData.title || "";
            ouvintes = apiData.ouvintes_conectados || "";
        } catch (e) {
            console.warn("API hdradios indispon\u00edvel, tentando Shoutcast /7.html");
        }

        if (!musicaAtual) {
            try {
                var scRes = await fetch(SHOUTCAST_STATUS_URL + '?_=' + Date.now(), { mode: 'cors' });
                if (scRes.ok) {
                    var scBuffer = await scRes.arrayBuffer();
                    var scText = new TextDecoder('utf-8').decode(scBuffer);
                    if (scText.indexOf('\uFFFD') !== -1) {
                        scText = new TextDecoder('iso-8859-1').decode(scBuffer);
                    }
                    var bodyMatch = scText.match(/<body>(.*?)<\/body>/i);
                    if (bodyMatch) {
                        var parts = bodyMatch[1].split(',');
                        if (parts.length >= 7) {
                            musicaAtual = parts.slice(6).join(',').trim();
                        }
                    }
                }
            } catch (e) {
                console.warn("Shoutcast /7.html indispon\u00edvel");
            }
        }

        if (ouvintes) {
            var listenersEl = document.getElementById('listenerCount');
            if (listenersEl) listenersEl.textContent = displayListeners(ouvintes);
        }

        if (musicaAtual && typeof musicaAtual === 'string' && musicaAtual.trim() !== '' && musicaAtual !== currentSong) {
            applySong(musicaAtual);
        } else if (!currentSong) {
            document.getElementById('songTitle').textContent = "Ao Vivo";
            document.getElementById('songArtist').textContent = "R\u00e1dio Positiva FM";
        }
    }

    // WEATHER
    function getDayName(dateString) {
        var date = new Date(dateString + 'T00:00:00');
        var days = ['Domingo', 'Segunda-Feira', 'Ter\u00e7a-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'S\u00e1bado'];
        return days[date.getDay()];
    }

    async function fetchWeather() {
        try {
            var res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=-22.97&longitude=-44.31&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=America%2FSao_Paulo");
            weatherData = await res.json();
            if (weatherData.current_weather) {
                var temp = Math.round(weatherData.current_weather.temperature);
                document.getElementById('weather-temp').innerHTML = '<i class="fas fa-temperature-half" style="color:#FFD700;"></i> <span>' + temp + '&deg;C Angra dos Reis</span>';
            }
        } catch (e) { }
    }

    function openWeatherModal() {
        if (!weatherData || !weatherData.daily) return;
        var daily = weatherData.daily;
        var html = "";
        for (var i = 0; i < 7; i++) {
            var dayName = getDayName(daily.time[i]);
            var dateParts = daily.time[i].split('-');
            var formattedDate = dateParts[2] + '/' + dateParts[1];
            var icon = "fa-sun";
            if (daily.weathercode[i] > 2) icon = "fa-cloud-sun";
            if (daily.weathercode[i] > 45) icon = "fa-cloud";
            if (daily.weathercode[i] > 60) icon = "fa-cloud-rain";
            html += '<div class="weather-day-row"><div class="w-info"><span class="w-day-name">' + dayName + '</span><span class="w-date">' + formattedDate + '</span></div><div class="w-icon"><i class="fas ' + icon + '"></i></div><div class="w-temp"><span style="color:#ff6b6b">' + Math.round(daily.temperature_2m_max[i]) + '&deg;</span> / <span style="color:#4ecdc4">' + Math.round(daily.temperature_2m_min[i]) + '&deg;</span></div></div>';
        }
        document.getElementById('weatherList').innerHTML = html;
        document.getElementById('weatherModal').classList.add('open');
    }

    function closeWeatherModal() {
        document.getElementById('weatherModal').classList.remove('open');
    }

    // NEWS
    function renderNewsTicker() {
        var ticker = document.getElementById('newsTickerContent');
        if (!newsItems || newsItems.length === 0) {
            ticker.innerHTML = '<span class="ticker-item" style="color:#888">Not\u00edcias indispon\u00edveis no momento</span><span class="ticker-item" style="color:#888">Not\u00edcias indispon\u00edveis no momento</span>';
            return;
        }
        var html = '';
        for (var idx = 0; idx < newsItems.length; idx++) {
            html += '<span class="ticker-item" data-news-idx="' + idx + '"><strong>' + (idx + 1) + '.</strong> ' + escapeHtml(newsItems[idx].title) + '</span>';
        }
        ticker.textContent = '';
        ticker.innerHTML = html + html;
    }

    async function fetchRSSNewsFallback() {
        try {
            var res = await fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(RSS_URL));
            var data = await res.json();
            if (data.status === 'ok') {
                newsItems = data.items.slice(0, 10);
                renderNewsTicker();
                renderCarousel();
            }
        } catch (e) {
            console.error('Erro ao buscar not\u00edcias:', e);
            renderNewsTicker();
        }
    }

    function extractFirstImage(html) {
        if (!html) return '';
        var m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m) return m[1];
        m = html.match(/<img[^>]+data-src=["']([^"']+)["']/i);
        if (m) return m[1];
        return '';
    }

    function openNewsModal(idx) {
        var item = newsItems[idx];
        if (!item) return;
        document.getElementById('modalTitle').textContent = item.title;
        var cleanDesc = item.description ? item.description.replace(/<[^>]*>?/gm, '').substring(0, 300) + "..." : "";
        document.getElementById('modalDesc').textContent = cleanDesc;
        document.getElementById('modalLink').href = item.link;
        document.getElementById('newsModal').classList.add('open');
    }

    function closeNewsModal() {
        document.getElementById('newsModal').classList.remove('open');
    }

    // NEWS CAROUSEL
    function renderCarousel() {
        var track = document.getElementById('newsCarouselTrack');
        var dotsContainer = document.getElementById('newsCarouselDots');
        if (!newsItems || newsItems.length === 0) {
            track.innerHTML = '<div class="news-carousel-slide" style="justify-content:center;align-items:center;min-height:150px;"><p style="color:#666;">Nenhuma not\u00edcia dispon\u00edvel no momento.</p></div>';
            dotsContainer.innerHTML = '';
            return;
        }
        track.innerHTML = '';
        for (var idx = 0; idx < newsItems.length; idx++) {
            var item = newsItems[idx];
            var imgUrl = item.image || item.thumbnail || (item.enclosure && item.enclosure.link) || extractFirstImage(item.description) || PLACEHOLDER_IMG;
            var safeTitle = escapeHtml(item.title);
            var cleanDesc = item.description ? item.description.replace(/<[^>]*>?/gm, '').substring(0, 100) : '';
            var safeDesc = escapeHtml(cleanDesc);
            var slide = document.createElement('div');
            slide.className = 'news-carousel-slide';
            slide.innerHTML =
                '<img src="' + imgUrl + '" alt="' + safeTitle + '" loading="lazy" onerror="this.src=\'' + PLACEHOLDER_IMG + '\'">' +
                '<h4>' + safeTitle + '</h4>' +
                '<p>' + safeDesc + '...</p>' +
                '<a href="' + item.link + '" target="_blank" class="leia-mais">Leia mais <i class="fas fa-arrow-right"></i></a>';
            track.appendChild(slide);
        }
        dotsContainer.innerHTML = '';
        for (var d = 0; d < newsItems.length; d++) {
            (function (index) {
                var dot = document.createElement('span');
                dot.addEventListener('click', function () { goToSlide(index); });
                dotsContainer.appendChild(dot);
            })(d);
        }
        goToSlide(0);
        startCarousel();
    }

    function goToSlide(index) {
        var track = document.getElementById('newsCarouselTrack');
        var slides = track.querySelectorAll('.news-carousel-slide');
        var dots = document.querySelectorAll('#newsCarouselDots span');
        if (!slides.length) return;
        if (index >= slides.length) index = 0;
        if (index < 0) index = slides.length - 1;
        carouselIndex = index;
        track.style.transform = 'translateX(-' + (index * 100) + '%)';
        for (var i = 0; i < dots.length; i++) {
            dots[i].classList.toggle('active', i === index);
        }
    }

    function nextSlide() { goToSlide(carouselIndex + 1); }
    function prevSlide() { goToSlide(carouselIndex - 1); }

    function startCarousel() {
        if (carouselTimer) clearInterval(carouselTimer);
        carouselTimer = setInterval(nextSlide, 6000);
    }

    function resetCarousel() {
        if (carouselTimer) clearInterval(carouselTimer);
        startCarousel();
    }

    // SHARE
    function handleShare() {
        var shareData = {
            title: 'R\u00e1dio Positiva FM 95.1',
            text: currentSong ? '🎵 Tocando agora: ' + currentSong : '🎧 Ouvindo R\u00e1dio Positiva FM 95.1 ao vivo!',
            url: window.location.href
        };
        try {
            if (navigator.share) {
                navigator.share(shareData).then(function () {
                    showToast('Compartilhado com sucesso!');
                }).catch(function () { });
            } else {
                var whatsappUrl = 'https://wa.me/?text=' + encodeURIComponent(shareData.text + ' ' + shareData.url);
                window.open(whatsappUrl, '_blank');
                showToast('Abrindo WhatsApp...');
            }
        } catch (err) {
            console.log('Erro ao compartilhar:', err);
        }
    }

    // PLAY / PAUSE
    function triggerRipple() {
        var btn = document.getElementById('btnPlayPause');
        btn.classList.remove('ripple');
        void btn.offsetWidth;
        btn.classList.add('ripple');
        setTimeout(function () { btn.classList.remove('ripple'); }, 800);
    }

    function togglePlay() {
        triggerRipple();
        // Se está tocando mudo (autoplay), apenas ativa o som
        if (!audioPlayer.paused && audioPlayer.muted) {
            audioPlayer.muted = false;
            document.getElementById('btnMute').querySelector('i').className = 'fas fa-volume-up';
            document.getElementById('volumeSlider').value = lastVolume;
            showToast('\u00c1udio ativado!');
            return;
        }
        if (audioPlayer.paused) {
            audioPlayer.muted = false;
            audioPlayer.src = STREAM_URL + '?t=' + Date.now();
            audioPlayer.load();
            audioPlayer.play().then(function () {
                isPlaying = true;
                initAudioVisualizer();
                document.getElementById('iconPlay').className = 'fas fa-pause';
                fetchRadioData();
                if (!dataUpdateInterval) {
                    dataUpdateInterval = setInterval(fetchRadioData, 60000);
                }
            }).catch(function (err) {
                if (err && err.name === 'AbortError') return;
                if (err && err.name === 'NotAllowedError') {
                    showToast('Clique em ▶ para reproduzir a r\u00e1dio');
                    return;
                }
                showToast('Erro ao conectar com a r\u00e1dio. Tente novamente.');
            });
        } else {
            audioPlayer.pause();
            isPlaying = false;
            document.getElementById('iconPlay').className = 'fas fa-play';
            if (songUpdateInterval) {
                clearInterval(songUpdateInterval);
                songUpdateInterval = null;
            }
        }
    }

    // VOLUME / MUTE
    function handleVolume(e) {
        var vol = parseFloat(e.target.value);
        audioPlayer.volume = vol;
        var icon = document.getElementById('btnMute').querySelector('i');
        if (vol === 0) {
            audioPlayer.muted = false;
            icon.className = 'fas fa-volume-mute';
        } else {
            if (audioPlayer.muted) audioPlayer.muted = false;
            icon.className = 'fas fa-volume-up';
        }
    }

    function handleMute() {
        var icon = document.getElementById('btnMute').querySelector('i');
        if (audioPlayer.volume > 0) {
            lastVolume = audioPlayer.volume;
            audioPlayer.volume = 0;
            document.getElementById('volumeSlider').value = 0;
            icon.className = 'fas fa-volume-mute';
        } else {
            audioPlayer.volume = lastVolume;
            audioPlayer.muted = false;
            document.getElementById('volumeSlider').value = lastVolume;
            icon.className = 'fas fa-volume-up';
        }
    }

    // TOAST
    function showToast(message) {
        var toast = document.getElementById('toast');
        toast.querySelector('span').textContent = message;
        toast.classList.add('show');
        setTimeout(function () { toast.classList.remove('show'); }, 3000);
    }

    // PHARMACY
    var pharmacyData = [
        { name: 'Drogatur Balne\u00e1rio', badge: '24h', addr: 'Av. Caravelas, 267 - Balne\u00e1rio', phone: '(24) 3365-2661', lat: -22.9977, lng: -44.3200, alwaysOpen: true, hours: '' },
        { name: 'Drogatur Japoranga', badge: '24h', addr: 'R. Japoranga, 851 - Japu\u00edba', phone: '(24) 3365-2661', lat: -22.9716, lng: -44.2982, alwaysOpen: true, hours: '' },
        { name: 'Drogatur Centro (LJ 04)', badge: '24h', addr: 'Centro - Angra dos Reis', phone: '(24) 3365-2661', lat: -22.9930, lng: -44.3150, alwaysOpen: true, hours: '' },
        { name: 'Drogatur Centro (LJ 05)', badge: '24h', addr: 'Centro - Angra dos Reis', phone: '(24) 3365-2661', lat: -22.9932, lng: -44.3152, alwaysOpen: true, hours: '' },
        { name: 'Drogatur Japoranga (LJ 27)', badge: '24h', addr: 'R. Japoranga - Japu\u00edba', phone: '(24) 3365-2661', lat: -22.9718, lng: -44.2980, alwaysOpen: true, hours: '' },
        { name: 'Drogaria Retiro Perequ\u00ea', badge: '24h', addr: 'Av. Francisco M. Castro, 249 - Perequ\u00ea', phone: '(24) 3362-4923', lat: -22.9472, lng: -44.2410, alwaysOpen: true, hours: '' },
        { name: 'Drogaria Retiro Japu\u00edba', badge: '', addr: 'R. Francelino A. Lima, 38 - Japu\u00edba', phone: '(24) 3365-3000', lat: -22.9720, lng: -44.2975, alwaysOpen: false, hours: { open: 7, close: 22 } },
        { name: 'Drogarias Pacheco Centro', badge: '', addr: 'R. do Com\u00e9rcio, 256 - Centro', phone: '(24) 3365-4987', lat: -22.9925, lng: -44.3145, alwaysOpen: false, hours: { open: 8, close: 21 } },
        { name: 'Drogarias Pacheco Palmeiras', badge: '', addr: 'Av. Jos\u00e9 Elias Raba, 280 - Parque das Palmeiras', phone: '(24) 3365-4908', lat: -22.9995, lng: -44.3019, alwaysOpen: false, hours: { open: 8, close: 21 } },
        { name: 'Droga Raia Balne\u00e1rio', badge: '', addr: 'R. Alm. Machado Portela, 179 - Balne\u00e1rio', phone: '(24) 99884-5261', lat: -22.9970, lng: -44.3195, alwaysOpen: false, hours: { open: 8, close: 22 } },
        { name: 'Drogatur Nova Angra', badge: '22h', addr: 'Av. Itagua\u00ed, 16 - Nova Angra', phone: '(24) 3365-2661', lat: -22.9570, lng: -44.2750, alwaysOpen: false, hours: { open: 6, close: 22 } },
        { name: 'Drogatur Shopping Piratas', badge: '22h', addr: 'Shopping Piratas - Praia do Jardim', phone: '(24) 3365-2661', lat: -22.9936, lng: -44.3165, alwaysOpen: false, hours: { open: 8, close: 22 } },
        { name: 'Drogatur Ilha Grande', badge: '22h', addr: 'Abra\u00e3o - Ilha Grande', phone: '(24) 3365-2661', lat: -23.1450, lng: -44.1680, alwaysOpen: false, hours: { open: 8, close: 22 } },
        { name: 'Drogaria Avenida', badge: '', addr: 'R. Cel Carvalho, 173 lj B - Centro', phone: '(24) 3365-0000', lat: -22.9928, lng: -44.3148, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogaria Nacional', badge: '', addr: 'Av. Raul Pomp\u00e9ia, 62 - Centro', phone: '(24) 3365-0000', lat: -22.9915, lng: -44.3130, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogaria Santa Rosa', badge: '', addr: 'Tv. Sta Luzia, 31 - Centro', phone: '(24) 3365-0000', lat: -22.9920, lng: -44.3140, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogaria Ultrapopular', badge: '', addr: 'R. do Com\u00e9rcio, 30 - Centro', phone: '(24) 3365-0000', lat: -22.9922, lng: -44.3135, alwaysOpen: false, hours: { open: 8, close: 20 } },
        { name: 'Drogarias FarMelhor', badge: '', addr: 'R. Jos\u00e9 Belmiro da Paix\u00e3o, 148 - Palmeiras', phone: '(24) 2404-2404', lat: -23.0000, lng: -44.3025, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogaria do Povo', badge: '', addr: 'R. Pref. Jo\u00e3o G. Galindo, 392 - Japu\u00edba', phone: '(24) 99997-0000', lat: -22.9725, lng: -44.2970, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogaria Moderna', badge: '', addr: 'R. Francelino A. Lima, 32-34 - Areal', phone: '(21) 3003-0000', lat: -22.9710, lng: -44.2965, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogaria Vinys', badge: '', addr: 'R. Francelino A. Lima, 22 - Areal', phone: '(24) 3377-0000', lat: -22.9708, lng: -44.2960, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogaria Angrense', badge: '', addr: 'R. do Com\u00e9rcio, 233 - Centro', phone: '(24) 3365-0000', lat: -22.9926, lng: -44.3142, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogaria Sophia', badge: '', addr: 'Av. Francisco M. Castro, 113 - Mambucaba', phone: '(24) 3365-0000', lat: -22.9500, lng: -44.2430, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogaria Adonai', badge: '', addr: 'R. do Com\u00e9rcio, 392 - Centro', phone: '(24) 3365-0000', lat: -22.9924, lng: -44.3146, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogaria Doce Mar', badge: '', addr: 'Pc Gal Silvestre Travassos, 98 - Centro', phone: '(24) 3365-0000', lat: -22.9918, lng: -44.3138, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogaria Liberdade', badge: '', addr: 'R. Pref. Jo\u00e3o L. G. Rocha, 851 - Japu\u00edba', phone: '(24) 3365-0000', lat: -22.9722, lng: -44.2978, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogatur Tararaca', badge: '', addr: 'R. Pref. Jo\u00e3o G. Galindo - Tararaca', phone: '(24) 3365-2661', lat: -22.9820, lng: -44.3100, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogatur Monsuaba', badge: '', addr: 'Monsuaba', phone: '(24) 3365-2661', lat: -22.9550, lng: -44.2550, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogatur Frade', badge: '', addr: 'Frade - S\u00e3o Sebasti\u00e3o', phone: '(24) 3365-2661', lat: -22.9400, lng: -44.2300, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Drogatur Bracuhy', badge: '', addr: 'Bracuhy', phone: '(24) 3365-2661', lat: -22.9650, lng: -44.2850, alwaysOpen: false, hours: { open: 8, close: 19 } },
        { name: 'Farm\u00e1cia CityFarma', badge: '', addr: 'Angra dos Reis', phone: '(24) 3365-0000', lat: -22.9910, lng: -44.3120, alwaysOpen: false, hours: { open: 8, close: 19 } }
    ];

    function getPharmacyStatus(p) {
        if (p.alwaysOpen) return true;
        if (!p.hours) return false;
        var now = new Date();
        var h = now.getHours();
        var m = now.getMinutes();
        var current = h + m / 60;
        return current >= p.hours.open && current < p.hours.close;
    }

    function renderPharmacies() {
        var list = document.getElementById('pharmacyList');
        var hasAnyOpen = false;
        var html = '';
        for (var i = 0; i < pharmacyData.length; i++) {
            var p = pharmacyData[i];
            var isOpen = getPharmacyStatus(p);
            if (isOpen) hasAnyOpen = true;
            if (showOpenOnly && !isOpen) continue;
            var statusClass = isOpen ? 'open-now' : 'closed-now';
            var statusText = isOpen ? 'Aberto' : 'Fechado';
            var safeName = escapeHtml(p.name);
            var safeAddr = escapeHtml(p.addr);
            var safePhone = escapeHtml(p.phone);
            var badgeHtml = p.badge ? ' <span class="p-badge p-' + (p.badge === '24h' ? '24h' : '22h') + '">' + escapeHtml(p.badge) + '</span>' : '';
            var encodedSearch = encodeURIComponent(p.name + ' ' + p.addr + ' Angra dos Reis');
            html += '<div class="pharmacy-item" onclick="window.open(\'https://www.google.com/maps/search/' + encodedSearch + '\',\'_blank\')">' +
                '<div class="p-icon"><i class="fas fa-medkit"></i></div>' +
                '<div class="p-info">' +
                '<div class="p-name">' + safeName + badgeHtml + '</div>' +
                '<div class="p-address"><i class="fas fa-map-marker-alt" style="color:var(--primary-color);font-size:.6rem"></i> ' + safeAddr + '</div>' +
                '<div class="p-phone"><i class="fas fa-phone"></i> ' + safePhone + '</div>' +
                '</div>' +
                '<span class="p-status ' + statusClass + '">' + statusText + '</span>' +
                '</div>';
        }
        list.innerHTML = html || '<div style="text-align:center;padding:20px;color:#888"><i class="fas fa-info-circle"></i> Nenhuma farm\u00e1cia aberta no momento.</div>';
        var statusEl = document.getElementById('pharmacyGeneralStatus');
        if (hasAnyOpen) {
            statusEl.textContent = 'Abertas agora';
            statusEl.className = 'pharmacy-status-geral open';
        } else {
            statusEl.textContent = 'Fechadas';
            statusEl.className = 'pharmacy-status-geral closed';
        }
        var btn = document.getElementById('pharmacyFilterBtn');
        if (showOpenOnly) {
            btn.innerHTML = '<i class="fas fa-list"></i> Mostrar todas';
            btn.style.background = 'var(--accent-orange)';
        } else {
            btn.innerHTML = '<i class="fas fa-filter"></i> Mostrar s\u00f3 abertas';
            btn.style.background = 'var(--primary-color)';
        }
    }

    // AD SLIDER
    function initAdSlider() {
        var sliderContainer = document.getElementById('sliderContainer');
        var slides = sliderContainer.querySelectorAll('.ads-slider-item');
        var prevBtn = document.getElementById('prevSlide');
        var nextBtn = document.getElementById('nextSlide');
        var currentIndex = 0;
        var autoSlideInterval;

        function showSlide(index) {
            if (index < 0) index = slides.length - 1;
            if (index >= slides.length) index = 0;
            for (var i = 0; i < slides.length; i++) {
                slides[i].classList.remove('active');
            }
            slides[index].classList.add('active');
            currentIndex = index;
        }

        function nextSlideFn() { showSlide(currentIndex + 1); resetAutoSlide(); }
        function prevSlideFn() { showSlide(currentIndex - 1); resetAutoSlide(); }

        function startAutoSlide() {
            autoSlideInterval = setInterval(function () { showSlide(currentIndex + 1); }, 5000);
        }

        function resetAutoSlide() {
            clearInterval(autoSlideInterval);
            startAutoSlide();
        }

        prevBtn.addEventListener('click', prevSlideFn);
        nextBtn.addEventListener('click', nextSlideFn);
        startAutoSlide();
        sliderContainer.addEventListener('mouseenter', function () { clearInterval(autoSlideInterval); });
        sliderContainer.addEventListener('mouseleave', startAutoSlide);
    }

    // TICKER NEWS CLICK
    function initTickerClick() {
        document.getElementById('newsTickerContent').addEventListener('click', function (e) {
            var span = e.target.closest('.ticker-item');
            if (span) {
                var idx = parseInt(span.dataset.newsIdx, 10);
                if (!isNaN(idx)) {
                    openNewsModal(idx);
                }
            }
        });
    }

    // SCHEDULE
    var scheduleData = {
        seg: [
            { h: '06:00', p: 'MANH\u00c3 POSITIVA', a: 'Viny Gomes' },
            { h: '08:00', p: 'BOM DIA, POSITIVA', a: 'ZARETA' },
            { h: '10:00', p: 'PAINEL DE CONTROLE', a: 'Cristiano Ferreira' },
            { h: '12:00', p: 'SELE\u00c7\u00c3O BRASIL', a: 'Cristiano Ferreira' },
            { h: '13:00', p: 'SAPECANDO NO FORR\u00d3', a: 'SANDRO SANTOS' },
            { h: '18:00', p: 'PARAD\u00c3O SERTANEJO', a: 'ZARETA' },
            { h: '20:00', p: 'SACOLEJO', a: 'ZARETA' },
            { h: '22:00', p: 'ESTA\u00c7\u00c3O 10', a: 'ZARETA' }
        ],
        ter: [
            { h: '06:00', p: 'MANH\u00c3 POSITIVA', a: 'Viny Gomes' },
            { h: '08:00', p: 'BOM DIA, POSITIVA', a: 'ZARETA' },
            { h: '10:00', p: 'PAINEL DE CONTROLE', a: 'Cristiano Ferreira' },
            { h: '12:00', p: 'SELE\u00c7\u00c3O BRASIL', a: 'Cristiano Ferreira' },
            { h: '13:00', p: 'SAPECANDO NO FORR\u00d3', a: 'SANDRO SANTOS' },
            { h: '18:00', p: 'PARAD\u00c3O SERTANEJO', a: 'ZARETA' },
            { h: '20:00', p: 'SACOLEJO', a: 'ZARETA' },
            { h: '22:00', p: 'ESTA\u00c7\u00c3O 10', a: 'ZARETA' }
        ],
        qua: [
            { h: '06:00', p: 'MANH\u00c3 POSITIVA', a: 'Viny Gomes' },
            { h: '08:00', p: 'BOM DIA, POSITIVA', a: 'ZARETA' },
            { h: '10:00', p: 'PAINEL DE CONTROLE', a: 'Cristiano Ferreira' },
            { h: '12:00', p: 'SELE\u00c7\u00c3O BRASIL', a: 'Cristiano Ferreira' },
            { h: '13:00', p: 'SAPECANDO NO FORR\u00d3', a: 'SANDRO SANTOS' },
            { h: '18:00', p: 'PARAD\u00c3O SERTANEJO', a: 'ZARETA' },
            { h: '20:00', p: 'SACOLEJO', a: 'ZARETA' },
            { h: '22:00', p: 'ESTA\u00c7\u00c3O 10', a: 'ZARETA' }
        ],
        qui: [
            { h: '06:00', p: 'MANH\u00c3 POSITIVA', a: 'Viny Gomes' },
            { h: '08:00', p: 'BOM DIA, POSITIVA', a: 'ZARETA' },
            { h: '10:00', p: 'PAINEL DE CONTROLE', a: 'Cristiano Ferreira' },
            { h: '12:00', p: 'SELE\u00c7\u00c3O BRASIL', a: 'Cristiano Ferreira' },
            { h: '13:00', p: 'SAPECANDO NO FORR\u00d3', a: 'SANDRO SANTOS' },
            { h: '18:00', p: 'PARAD\u00c3O SERTANEJO', a: 'ZARETA' },
            { h: '20:00', p: 'SACOLEJO', a: 'ZARETA' },
            { h: '22:00', p: 'ESTA\u00c7\u00c3O 10', a: 'ZARETA' }
        ],
        sex: [
            { h: '06:00', p: 'MANH\u00c3 POSITIVA', a: 'Viny Gomes' },
            { h: '08:00', p: 'BOM DIA, POSITIVA', a: 'ZARETA' },
            { h: '10:00', p: 'PAINEL DE CONTROLE', a: 'Cristiano Ferreira' },
            { h: '12:00', p: 'SELE\u00c7\u00c3O BRASIL', a: 'Cristiano Ferreira' },
            { h: '13:00', p: 'SAPECANDO NO FORR\u00d3', a: 'SANDRO SANTOS' },
            { h: '18:00', p: 'PARAD\u00c3O SERTANEJO', a: 'ZARETA' },
            { h: '20:00', p: 'SACOLEJO', a: 'ZARETA' },
            { h: '22:00', p: 'ESTA\u00c7\u00c3O 10', a: 'ZARETA' }
        ],
        sab: [
            { h: '06:00', p: 'MANH\u00c3 POSITIVA', a: 'Viny Gomes' },
            { h: '08:00', p: 'BOM DIA, POSITIVA', a: 'ZARETA' },
            { h: '10:00', p: 'PAINEL DE CONTROLE', a: 'Cristiano Ferreira' },
            { h: '12:00', p: 'SELE\u00c7\u00c3O BRASIL', a: 'Cristiano Ferreira' },
            { h: '13:00', p: 'SAPECANDO NO FORR\u00d3', a: 'SANDRO SANTOS' },
            { h: '18:00', p: 'PARAD\u00c3O SERTANEJO', a: 'ZARETA' },
            { h: '20:00', p: 'SACOLEJO', a: 'ZARETA' },
            { h: '22:00', p: 'ESTA\u00c7\u00c3O 10', a: 'ZARETA' }
        ],
        dom: [
            { h: '06:00', p: 'MANH\u00c3 POSITIVA', a: 'Viny Gomes' },
            { h: '08:00', p: 'BOM DIA, POSITIVA', a: 'ZARETA' },
            { h: '10:00', p: 'PAINEL DE CONTROLE', a: 'Cristiano Ferreira' },
            { h: '12:00', p: 'SELE\u00c7\u00c3O BRASIL', a: 'Cristiano Ferreira' },
            { h: '13:00', p: 'SAPECANDO NO FORR\u00d3', a: 'SANDRO SANTOS' },
            { h: '18:00', p: 'PARAD\u00c3O SERTANEJO', a: 'ZARETA' },
            { h: '20:00', p: 'SACOLEJO', a: 'ZARETA' },
            { h: '22:00', p: 'ESTA\u00c7\u00c3O 10', a: 'ZARETA' }
        ]
    };

    function renderSchedule(day) {
        var data = scheduleData[day] || [];
        var html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="border-bottom:1px solid var(--glass-border);color:var(--primary-color)"><th style="padding:8px;text-align:left">Hor\u00e1rio</th><th style="padding:8px;text-align:left">Programa</th><th style="padding:8px;text-align:left">Apresentador</th></tr></thead><tbody>';
        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            var border = i < data.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,0.05)' : '';
            html += '<tr style="' + border + '"><td style="padding:8px;color:var(--secondary-color);font-weight:700">' + escapeHtml(row.h) + '</td><td style="padding:8px">' + escapeHtml(row.p) + '</td><td style="padding:8px;color:#aaa">' + escapeHtml(row.a || '-') + '</td></tr>';
        }
        html += '</tbody></table>';
        document.getElementById('scheduleContent').innerHTML = html;
    }

    function updateOnAir() {
        var dayMap = { 0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab' };
        var now = new Date();
        var day = dayMap[now.getDay()];
        var currentMin = now.getHours() * 60 + now.getMinutes();
        var data = scheduleData[day] || [];
        var found = null;
        for (var i = 0; i < data.length; i++) {
            var parts = data[i].h.split(':');
            var startMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            var endMin = i < data.length - 1 ? (parseInt(data[i + 1].h.split(':')[0], 10) * 60 + parseInt(data[i + 1].h.split(':')[1], 10)) : 1440;
            if (currentMin >= startMin && currentMin < endMin) {
                found = data[i];
                found.end = data[i + 1] ? data[i + 1].h : '00:00';
                break;
            }
        }
        if (found) {
            document.getElementById('onairProgram').textContent = found.p;
            document.getElementById('onairPresenter').textContent = found.a || '---';
            document.getElementById('onairTime').textContent = found.h + ' \u00e0s ' + found.end;
        } else {
            document.getElementById('onairProgram').textContent = 'Programa\u00e7\u00e3o Normal';
            document.getElementById('onairPresenter').textContent = 'R\u00e1dio Positiva FM';
            document.getElementById('onairTime').textContent = '';
        }
    }

    // INIT
    function init() {
        // Schedule tabs
        document.getElementById('scheduleTabs').addEventListener('click', function (e) {
            var btn = e.target.closest('.sch-tab');
            if (!btn) return;
            var allTabs = document.querySelectorAll('.sch-tab');
            for (var i = 0; i < allTabs.length; i++) {
                allTabs[i].classList.remove('active');
            }
            btn.classList.add('active');
            renderSchedule(btn.getAttribute('data-day'));
        });

        // Weather
        document.getElementById('weather-temp').addEventListener('click', openWeatherModal);

        // Modals
        document.getElementById('weatherModal').addEventListener('click', function (e) {
            if (e.target === this) closeWeatherModal();
        });
        document.querySelector('#weatherModal .close-modal').addEventListener('click', closeWeatherModal);

        document.getElementById('newsModal').addEventListener('click', function (e) {
            if (e.target === this) closeNewsModal();
        });
        document.querySelector('#newsModal .close-modal').addEventListener('click', closeNewsModal);

        // Ticker click
        initTickerClick();

        // Play/Pause
        document.getElementById('btnPlayPause').addEventListener('click', togglePlay);

        // Stop
        document.getElementById('btnStop').addEventListener('click', function () {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            isPlaying = false;
            document.getElementById('iconPlay').className = 'fas fa-play';
            if (songUpdateInterval) {
                clearInterval(songUpdateInterval);
                songUpdateInterval = null;
            }
            document.getElementById('songTitle').textContent = 'Carregando...';
            document.getElementById('songArtist').textContent = 'Aguarde um instante';
        });

        // Volume
        document.getElementById('volumeSlider').addEventListener('input', handleVolume);

        // Mute
        document.getElementById('btnMute').addEventListener('click', handleMute);

        // Share
        document.getElementById('btnShare').addEventListener('click', handleShare);

        // Pharmacy toggle
        document.getElementById('pharmacyToggle').addEventListener('click', function () {
            var body = document.getElementById('pharmacyBody');
            var arrow = document.getElementById('pharmacyArrow');
            if (body.style.display === 'none') {
                body.style.display = 'block';
                arrow.style.transform = 'rotate(180deg)';
            } else {
                body.style.display = 'none';
                arrow.style.transform = 'rotate(0deg)';
            }
        });

        document.getElementById('pharmacyFilterBtn').addEventListener('click', function (e) {
            e.stopPropagation();
            showOpenOnly = !showOpenOnly;
            renderPharmacies();
        });

        // Initial renders
        renderSchedule('seg');
        updateOnAir();
        setInterval(updateOnAir, 60000);
        renderPharmacies();
        setInterval(renderPharmacies, 60000);

        // Ad slider
        initAdSlider();

        // Fetch data
        fetchWeather();
        fetchLiveSong();
        setInterval(fetchLiveSong, 3000);
        fetchLiveInfo();
        setInterval(fetchLiveInfo, 60000);
        fetchRadioData();
        setInterval(fetchWeather, 600000);
        if (!dataUpdateInterval) {
            dataUpdateInterval = setInterval(fetchRadioData, 60000);
        }

        // Sincroniza o volume do player com o slider
        audioPlayer.volume = lastVolume;

        // Autoplay: começa mudo (permitido pelo navegador) e pede um clique para ativar o som
        audioPlayer.muted = true;
        document.getElementById('btnMute').querySelector('i').className = 'fas fa-volume-mute';
        audioPlayer.src = STREAM_URL + '?t=' + Date.now();
        audioPlayer.load();
        audioPlayer.play().then(function () {
            isPlaying = true;
            document.getElementById('iconPlay').className = 'fas fa-pause';
            fetchRadioData();
            if (!dataUpdateInterval) {
                dataUpdateInterval = setInterval(fetchRadioData, 60000);
            }
            initAudioVisualizer();
            showToast('Clique em ▶ para ativar o som');
        }).catch(function () {
            isPlaying = false;
            document.getElementById('iconPlay').className = 'fas fa-play';
        });
    }

    document.addEventListener('DOMContentLoaded', init);

})();
