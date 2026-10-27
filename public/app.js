(function () {
  'use strict';

  var STORAGE_KEY = 'mia_bill_transactions';

  // Dropdown value (index.html) -> service ID the server accepts
  var SERVICE_MAP = {
    'waec': 'waec',
    'jamb': 'jamb',
    'neco': 'neco',
    'nabteb': 'nabteb',
    'school-fees': 'schoolfees',
    'acceptance-fees': 'admission',
    'data': 'data',
    'electricity': 'electricity',
    'tv': 'tv'
  };

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Shows the message in the status box AND right under the pay button
  function setStatus(message) {
    var el = $('paymentStatus');
    if (el) el.textContent = message;

    var button = $('payButton');
    if (button) {
      var note = $('payMessage');
      if (!note) {
        note = document.createElement('p');
        note.id = 'payMessage';
        note.setAttribute('role', 'alert');
        note.style.cssText = 'margin:12px 0 0;padding:10px 12px;border-radius:10px;background:#edf8f8;font-size:13px;font-weight:700;color:#075b68';
        button.insertAdjacentElement('afterend', note);
      }
      note.textContent = message;
    }
  }

  /* ---------- Local transaction history ---------- */

  function loadTransactions() {
    try {
      var list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveTransactions(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 50)));
    } catch (e) { /* storage unavailable */ }
  }

  function upsertTransaction(tx) {
    var list = loadTransactions();
    var index = list.findIndex(function (t) { return t.id === tx.id; });
    if (index >= 0) {
      list[index] = Object.assign({}, list[index], tx);
    } else {
      list.unshift(tx);
    }
    saveTransactions(list);
  }

  function formatDate(value) {
    var d = new Date(value);
    return isNaN(d.getTime()) ? String(value || '') : d.toLocaleString('en-NG');
  }

  function statusLabel(status) {
    if (status === 'verified') return '✅ Test payment verified';
    if (status === 'failed') return '❌ Not verified';
    if (status === 'pending') return '⏳ Awaiting payment';
    return String(status || '');
  }

  function renderHistory() {
    var box = $('transactionHistory');
    if (!box) return;

    var list = loadTransactions();
    if (!list.length) {
      box.innerHTML = '<div class="empty">No transactions yet. Complete a test payment and it will appear here.</div>';
      return;
    }

    var rows = list.map(function (t) {
      return '<tr>' +
        '<td>' + esc(formatDate(t.createdAt)) + '</td>' +
        '<td>' + esc(t.service) + '</td>' +
        '<td>₦' + Number(t.amount || 0).toLocaleString('en-NG') + '</td>' +
        '<td>' + esc(statusLabel(t.status)) + '</td>' +
        '<td>' + esc(t.id) + '</td>' +
        '</tr>';
    }).join('');

    box.innerHTML =
      '<table><thead><tr>' +
      '<th>Date</th><th>Service</th><th>Amount</th><th>Status</th><th>Reference</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  /* ---------- Start a payment ---------- */

  async function handleSubmit(event) {
    event.preventDefault();

    var button = $('payButton');
    var choice = $('service').value;
    var serviceId = SERVICE_MAP[choice];

    if (!choice) {
      setStatus('Please choose a service first.');
      return;
    }
    if (!serviceId) {
      setStatus('That service is not available in test mode yet. Please choose another one.');
      return;
    }

    var email = $('email').value.trim();
    var details = {
      category: choice,
      customerName: $('customerName').value.trim(),
      reference: $('customerReference').value.trim(),
      notes: $('details').value.trim()
    };

    var originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Connecting to Paystack…';
    setStatus('Starting secure test checkout…');

    try {
      var response = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId: serviceId, email: email, details: details })
      });

      var result = {};
      try { result = await response.json(); } catch (e) { /* non-JSON reply */ }

      if (!response.ok || !result.authorizationUrl) {
        throw new Error(
          result.error ||
          ('Server replied with status ' + response.status + '. The payment server may not be running or configured.')
        );
      }

      upsertTransaction({
        id: result.reference,
        service: result.service,
        amount: result.amount / 100,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });

      setStatus('Redirecting to Paystack…');
      window.location.href = result.authorizationUrl;
    } catch (err) {
      setStatus(err.message || 'Something went wrong. Please try again.');
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  /* ---------- Verify after returning from Paystack ---------- */

  async function verifyReturnedPayment() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('payment') !== 'verify') return;

    var reference = params.get('reference') || params.get('trxref');
    window.history.replaceState({}, document.title, window.location.pathname);

    if (!reference) {
      setStatus('No payment reference was returned by Paystack.');
      return;
    }

    setStatus('Verifying your payment with Paystack…');
    var statusEl = $('payMessage') || $('paymentStatus');
    if (statusEl && statusEl.scrollIntoView) {
      statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    try {
      var response = await fetch('/api/payments/verify/' + encodeURIComponent(reference));
      var result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Verification failed.');

      upsertTransaction({
        id: result.reference,
        service: result.service,
        amount: result.amount / 100,
        createdAt: new Date().toISOString(),
        status: result.verified ? 'verified' : 'failed'
      });

      setStatus(
        (result.verified ? '✅ ' : '⚠️ ') + result.message +
        ' Reference: ' + result.reference
      );
    } catch (err) {
      setStatus('Could not verify the payment: ' + (err.message || 'unknown error'));
    }

    renderHistory();
  }

  /* ---------- Wire everything up ---------- */

  var form = $('orderForm');
  if (form) form.addEventListener('submit', handleSubmit);

  window.addEventListener('maknazul:refresh-history', renderHistory);

  renderHistory();
  verifyReturnedPayment();
})();
