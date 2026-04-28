function uid() {
  return (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const DEFAULT_PRODUCTS = [
  { id: uid(), type: 'Rental Mobil', title: 'Avanza + Driver', price: 450000, desc: 'Nyaman untuk keluarga, city tour Surabaya-Malang.' },
  { id: uid(), type: 'Paket Tour', title: 'Bromo Sunrise', price: 650000, desc: 'Include transport + driver guide + itinerary.' },
  { id: uid(), type: 'Travel Surabaya-Malang', title: 'Shuttle Reguler', price: 120000, desc: 'Keberangkatan harian dengan armada nyaman.' }
];

const DEFAULT_AGENTS = [
  { id: uid(), name: 'CS Aulia', number: '6281234567890', active: true, chats: 0, deals: 0 },
  { id: uid(), name: 'CS Rafi', number: '6281299998888', active: true, chats: 0, deals: 0 }
];

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function rupiah(n) { return `Rp${Number(n).toLocaleString('id-ID')}`; }

function sanitizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

function ensureSeeds() {
  if (!localStorage.getItem('products')) save('products', DEFAULT_PRODUCTS);
  if (!localStorage.getItem('wa_agents')) save('wa_agents', DEFAULT_AGENTS);
  if (!localStorage.getItem('leads')) save('leads', []);
  if (!localStorage.getItem('rr_index')) localStorage.setItem('rr_index', '0');
}

function pickAgentRoundRobin() {
  const activeAgents = load('wa_agents', []).filter(a => a.active);
  if (!activeAgents.length) return null;
  const idx = Number(localStorage.getItem('rr_index') || 0) % activeAgents.length;
  const selected = activeAgents[idx];
  localStorage.setItem('rr_index', String((idx + 1) % activeAgents.length));
  return selected;
}

function renderServiceCards(filter = 'all') {
  const grid = document.getElementById('serviceGrid');
  if (!grid) return;
  const products = load('products', DEFAULT_PRODUCTS);
  const items = filter === 'all' ? products : products.filter(p => p.type === filter);
  grid.innerHTML = items.map(p => `
    <article class="card">
      <small>${p.type}</small>
      <h3>${p.title}</h3>
      <p>${p.desc}</p>
      <p class="price">Mulai ${rupiah(p.price)}</p>
      <a href="#booking" class="btn btn-primary">Booking via WA</a>
    </article>
  `).join('') || '<p>Tidak ada layanan pada kategori ini.</p>';
}

function bindPublicUI() {
  const menuBtn = document.getElementById('menuBtn');
  const nav = document.getElementById('mainNav');
  if (menuBtn && nav) menuBtn.addEventListener('click', () => nav.classList.toggle('open'));

  const filterWrap = document.getElementById('filterGroup');
  if (filterWrap) {
    filterWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      filterWrap.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderServiceCards(btn.dataset.filter);
    });
  }
}

function handleBookingForm() {
  const form = document.getElementById('bookingForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.checkValidity()) return form.reportValidity();

    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const customerPhone = sanitizePhone(payload.phone);
    if (!customerPhone || customerPhone.length < 10) {
      alert('Nomor WhatsApp tidak valid.');
      return;
    }

    const cs = pickAgentRoundRobin();
    if (!cs) {
      alert('Semua CS sedang offline. Coba lagi beberapa saat ya.');
      return;
    }

    const message = [
      'Halo Admin, saya ingin booking.',
      `Layanan: ${payload.serviceType}`,
      `Nama: ${payload.name}`,
      `No WA: ${customerPhone}`,
      `Tanggal/Jam: ${payload.datetime}`,
      `Rute: ${payload.route}`,
      `Catatan: ${payload.notes || '-'}`
    ].join('\n');

    const leads = load('leads', []);
    leads.unshift({
      id: uid(),
      createdAt: new Date().toISOString(),
      ...payload,
      phone: customerPhone,
      assignedTo: cs.id,
      assignedName: cs.name,
      assignedNumber: cs.number,
      status: 'New'
    });
    save('leads', leads);

    const agents = load('wa_agents', []);
    const index = agents.findIndex(a => a.id === cs.id);
    if (index >= 0) {
      agents[index].chats += 1;
      save('wa_agents', agents);
    }

    const waUrl = `https://api.whatsapp.com/send?phone=${cs.number}&text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
    form.reset();
  });
}

function renderAdmin() {
  const stats = document.getElementById('stats');
  if (!stats) return;

  const leads = load('leads', []);
  const agents = load('wa_agents', []);
  const products = load('products', []);

  stats.innerHTML = [
    ['Total Leads', leads.length],
    ['Total Deal', leads.filter(l => l.status === 'Deal').length],
    ['CS Aktif', agents.filter(a => a.active).length],
    ['Produk Aktif', products.length]
  ].map(([k, v]) => `<div><strong>${v}</strong><br><small>${k}</small></div>`).join('');

  const agentList = document.getElementById('agentList');
  if (agentList) {
    agentList.innerHTML = `
      <table class="table">
      <thead><tr><th>Nama</th><th>Nomor</th><th>Chat</th><th>Deal</th><th>Aksi</th></tr></thead>
      <tbody>
      ${agents.map(a => `
        <tr>
          <td>${a.name}${a.active ? '' : ' (off)'}</td>
          <td>${a.number}</td>
          <td>${a.chats}</td>
          <td>${a.deals}</td>
          <td class="actions">
            <button class="btn btn-ghost" onclick="toggleAgent('${a.id}')">${a.active ? 'Off' : 'On'}</button>
            <button class="btn btn-ghost" onclick="removeAgent('${a.id}')">Hapus</button>
          </td>
        </tr>
      `).join('')}
      </tbody>
      </table>`;
  }

  const leadList = document.getElementById('leadList');
  if (leadList) {
    leadList.innerHTML = `
      <table class="table">
      <thead><tr><th>Waktu</th><th>Layanan</th><th>Nama</th><th>CS</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>
      ${leads.map(l => {
        const msg = encodeURIComponent(`Halo ${l.name}, izin follow up booking ${l.serviceType} untuk ${l.datetime}.`);
        const statusClass = l.status === 'Deal' ? 'status-deal' : 'status-new';
        return `
          <tr>
            <td>${new Date(l.createdAt).toLocaleString('id-ID')}</td>
            <td>${l.serviceType}</td>
            <td>${l.name}</td>
            <td>${l.assignedName}</td>
            <td class="${statusClass}">${l.status}</td>
            <td class="actions">
              <a class="btn btn-primary" target="_blank" href="https://api.whatsapp.com/send?phone=${l.phone}&text=${msg}">Follow Up</a>
              <button class="btn btn-ghost" onclick="markDeal('${l.id}')">Mark Deal</button>
            </td>
          </tr>`;
      }).join('')}
      </tbody></table>`;
  }
}

window.toggleAgent = function(id) {
  const agents = load('wa_agents', []);
  const i = agents.findIndex(a => a.id === id);
  if (i >= 0) {
    agents[i].active = !agents[i].active;
    save('wa_agents', agents);
    renderAdmin();
  }
};

window.removeAgent = function(id) {
  save('wa_agents', load('wa_agents', []).filter(a => a.id !== id));
  renderAdmin();
};

window.markDeal = function(leadId) {
  const leads = load('leads', []);
  const i = leads.findIndex(l => l.id === leadId);
  if (i === -1) return;

  leads[i].status = 'Deal';
  save('leads', leads);

  const agents = load('wa_agents', []);
  const a = agents.findIndex(x => x.id === leads[i].assignedTo);
  if (a >= 0) {
    agents[a].deals += 1;
    save('wa_agents', agents);
  }
  renderAdmin();
};

function bindAdminForms() {
  const agentForm = document.getElementById('agentForm');
  if (agentForm) {
    agentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(agentForm);
      const agents = load('wa_agents', []);
      agents.push({
        id: uid(),
        name: String(fd.get('name') || '').trim(),
        number: sanitizePhone(fd.get('number')),
        active: true,
        chats: 0,
        deals: 0
      });
      save('wa_agents', agents);
      agentForm.reset();
      renderAdmin();
    });
  }

  const productForm = document.getElementById('productForm');
  if (productForm) {
    productForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(productForm);
      const products = load('products', []);
      products.push({
        id: uid(),
        type: fd.get('type'),
        title: String(fd.get('title') || '').trim(),
        price: Number(fd.get('price')),
        desc: String(fd.get('desc') || '').trim()
      });
      save('products', products);
      productForm.reset();
      renderServiceCards();
      renderAdmin();
    });
  }
}

ensureSeeds();
renderServiceCards();
bindPublicUI();
handleBookingForm();
bindAdminForms();
renderAdmin();
