const DEFAULT_PRODUCTS = [
  { id: crypto.randomUUID(), type: 'Rental Mobil', title: 'Avanza + Driver', price: 450000, desc: 'Cocok keluarga, area Surabaya-Malang.' },
  { id: crypto.randomUUID(), type: 'Paket Tour', title: 'Bromo Sunrise', price: 650000, desc: 'Include transport + driver guide.' },
  { id: crypto.randomUUID(), type: 'Travel Surabaya-Malang', title: 'Shuttle Reguler', price: 120000, desc: 'Keberangkatan harian, armada nyaman.' }
];

const DEFAULT_AGENTS = [
  { id: crypto.randomUUID(), name: 'CS Aulia', number: '6281234567890', active: true, chats: 0, deals: 0, lastResponseMin: 3 },
  { id: crypto.randomUUID(), name: 'CS Rafi', number: '6281299998888', active: true, chats: 0, deals: 0, lastResponseMin: 5 }
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

function ensureSeeds() {
  if (!localStorage.getItem('products')) save('products', DEFAULT_PRODUCTS);
  if (!localStorage.getItem('wa_agents')) save('wa_agents', DEFAULT_AGENTS);
  if (!localStorage.getItem('leads')) save('leads', []);
  if (!localStorage.getItem('rr_index')) localStorage.setItem('rr_index', '0');
}

function rupiah(n) { return `Rp${Number(n).toLocaleString('id-ID')}`; }

function pickAgentRoundRobin() {
  const agents = load('wa_agents', []).filter(a => a.active);
  if (!agents.length) return null;
  const idx = Number(localStorage.getItem('rr_index') || '0') % agents.length;
  const agent = agents[idx];
  localStorage.setItem('rr_index', String((idx + 1) % agents.length));
  return agent;
}

function renderServiceCards() {
  const grid = document.getElementById('serviceGrid');
  if (!grid) return;
  const products = load('products', DEFAULT_PRODUCTS);
  grid.innerHTML = products.map(p => `
    <article class="card">
      <small>${p.type}</small>
      <h3>${p.title}</h3>
      <p>${p.desc}</p>
      <p class="price">Mulai ${rupiah(p.price)}</p>
      <a href="#booking" class="btn btn-primary">Booking via WA</a>
    </article>
  `).join('');
}

function handleBookingForm() {
  const form = document.getElementById('bookingForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const agent = pickAgentRoundRobin();
    if (!agent) return alert('CS sedang offline. Silakan coba beberapa saat lagi.');

    const text = [
      'Halo Admin, saya ingin booking.',
      `Layanan: ${payload.serviceType}`,
      `Nama: ${payload.name}`,
      `No WA: ${payload.phone}`,
      `Tanggal/Jam: ${payload.datetime}`,
      `Rute: ${payload.route}`,
      `Catatan: ${payload.notes || '-'}`
    ].join('\n');

    const leads = load('leads', []);
    leads.unshift({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...payload,
      assignedTo: agent.id,
      assignedName: agent.name,
      assignedNumber: agent.number,
      status: 'New'
    });
    save('leads', leads);

    const agents = load('wa_agents', []);
    const i = agents.findIndex(a => a.id === agent.id);
    if (i >= 0) {
      agents[i].chats += 1;
      save('wa_agents', agents);
    }

    const waUrl = `https://api.whatsapp.com/send?phone=${agent.number}&text=${encodeURIComponent(text)}`;
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

  const dealCount = leads.filter(l => l.status === 'Deal').length;
  stats.innerHTML = [
    ['Total Leads', leads.length],
    ['Total Deal', dealCount],
    ['CS Aktif', agents.filter(a => a.active).length],
    ['Produk Aktif', products.length]
  ].map(([k, v]) => `<div><strong>${v}</strong><br><small>${k}</small></div>`).join('');

  const agentList = document.getElementById('agentList');
  if (agentList) {
    agentList.innerHTML = `
      <table class="table"><thead><tr><th>Nama</th><th>Nomor</th><th>Chat</th><th>Deal</th><th>Aksi</th></tr></thead>
      <tbody>
      ${agents.map(a => `
        <tr>
          <td>${a.name}${a.active ? '' : ' (off)'}</td>
          <td>${a.number}</td>
          <td>${a.chats}</td>
          <td>${a.deals}</td>
          <td>
            <button class="btn btn-ghost" onclick="toggleAgent('${a.id}')">${a.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
            <button class="btn btn-ghost" onclick="removeAgent('${a.id}')">Hapus</button>
          </td>
        </tr>
      `).join('')}
      </tbody></table>
    `;
  }

  const leadList = document.getElementById('leadList');
  if (leadList) {
    leadList.innerHTML = `
      <table class="table"><thead><tr><th>Waktu</th><th>Layanan</th><th>Nama</th><th>CS</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>
      ${leads.map(l => {
        const msg = encodeURIComponent(`Halo ${l.name}, izin follow up booking ${l.serviceType} untuk ${l.datetime}.`);
        return `
        <tr>
          <td>${new Date(l.createdAt).toLocaleString('id-ID')}</td>
          <td>${l.serviceType}</td>
          <td>${l.name}</td>
          <td>${l.assignedName}</td>
          <td>${l.status}</td>
          <td>
            <a class="btn btn-primary" target="_blank" href="https://api.whatsapp.com/send?phone=${l.phone.replace(/^0/, '62')}&text=${msg}">Follow Up</a>
            <button class="btn btn-ghost" onclick="markDeal('${l.id}')">Mark Deal</button>
          </td>
        </tr>`;
      }).join('')}
      </tbody></table>
    `;
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
  const agents = load('wa_agents', []).filter(a => a.id !== id);
  save('wa_agents', agents);
  renderAdmin();
};

window.markDeal = function(leadId) {
  const leads = load('leads', []);
  const i = leads.findIndex(l => l.id === leadId);
  if (i >= 0) {
    leads[i].status = 'Deal';
    save('leads', leads);
    const agents = load('wa_agents', []);
    const a = agents.findIndex(x => x.id === leads[i].assignedTo);
    if (a >= 0) {
      agents[a].deals += 1;
      save('wa_agents', agents);
    }
    renderAdmin();
  }
};

function bindAdminForms() {
  const agentForm = document.getElementById('agentForm');
  if (agentForm) {
    agentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(agentForm);
      const agents = load('wa_agents', []);
      agents.push({
        id: crypto.randomUUID(),
        name: fd.get('name'),
        number: String(fd.get('number')).replace(/\D/g, ''),
        active: true,
        chats: 0,
        deals: 0,
        lastResponseMin: 0
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
        id: crypto.randomUUID(),
        type: fd.get('type'),
        title: fd.get('title'),
        price: Number(fd.get('price')),
        desc: fd.get('desc')
      });
      save('products', products);
      productForm.reset();
      renderAdmin();
    });
  }
}

ensureSeeds();
renderServiceCards();
handleBookingForm();
bindAdminForms();
renderAdmin();
