'use strict';

const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

// --- IN-MEMORY DATABASE ---
const db = {
  products: [
    { id: '1', name: 'iPhone 19 Pro Max', price: 1399, stock: 50, category: 'Mobile', image: 'https://images.unsplash.com/photo-1696429175928-79201f66734a?q=80&w=600&auto=format&fit=crop' },
    { id: '2', name: 'Galaxy S27 Ultra', price: 1299, stock: 30, category: 'Mobile', image: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?q=80&w=600&auto=format&fit=crop' },
    { id: '3', name: 'Xiaomi Mi 15 Ultra', price: 999, stock: 100, category: 'Mobile', image: 'https://images.unsplash.com/photo-1598327105666-5b89351cb31b?q=80&w=600&auto=format&fit=crop' },
    { id: '4', name: 'MacBook Pro M4', price: 2499, stock: 15, category: 'Laptop', image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=600&auto=format&fit=crop' },
    { id: '5', name: 'Sony WH-1000XM6', price: 399, stock: 80, category: 'Audio', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=600&auto=format&fit=crop' },
    { id: '6', name: 'iPad Pro 13"', price: 1099, stock: 45, category: 'Tablet', image: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?q=80&w=600&auto=format&fit=crop' }
  ],
  carts: {} // { "sessionToken": [ { productId, quantity } ] }
};

// --- HELPERS ---
function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function getCartTotal(cartItems) {
  return cartItems.reduce((total, item) => {
    const product = db.products.find(p => p.id === item.productId);
    return total + (product ? product.price * item.quantity : 0);
  }, 0);
}

// --- SERVER & ROUTING ---
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const method = req.method;

  // CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    // 1. Root / Frontend UI
    if (path === '/' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>NEXUS | 2027 Tech Store</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap" rel="stylesheet">
          <style>
            :root {
              --bg: #0a0a0a;
              --card-bg: #151515;
              --text: #ffffff;
              --text-muted: #888888;
              --accent: #00ff88;
              --accent-hover: #00cc6a;
              --border: #2a2a2a;
            }
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
            body { background-color: var(--bg); color: var(--text); overflow-x: hidden; }
            
            /* Navbar */
            header { 
              display: flex; justify-content: space-between; align-items: center; 
              padding: 1.5rem 5%; background: rgba(10,10,10,0.9); backdrop-filter: blur(10px);
              position: sticky; top: 0; z-index: 100; border-bottom: 1px solid var(--border);
            }
            .logo { font-size: 1.8rem; font-weight: 800; letter-spacing: 2px; color: var(--text); text-decoration: none; }
            .logo span { color: var(--accent); }
            .cart-btn { 
              background: var(--card-bg); border: 1px solid var(--border); color: var(--text); 
              padding: 0.6rem 1.2rem; border-radius: 50px; cursor: pointer; font-weight: 600;
              display: flex; align-items: center; gap: 10px; transition: 0.3s;
            }
            .cart-btn:hover { border-color: var(--accent); }
            #cart-count { background: var(--accent); color: #000; padding: 2px 8px; border-radius: 50%; font-weight: bold; }

            /* Hero */
            .hero {
              text-align: center; padding: 6rem 2rem; 
              background: radial-gradient(circle at 50% 0%, #1a2a1a 0%, var(--bg) 70%);
            }
            .hero h1 { font-size: 4rem; font-weight: 800; margin-bottom: 1rem; line-height: 1.1; }
            .hero p { color: var(--text-muted); font-size: 1.2rem; max-width: 600px; margin: 0 auto; }

            /* Product Grid */
            .container { padding: 2rem 5%; }
            .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 2rem; }
            
            .card { 
              background: var(--card-bg); border-radius: 16px; overflow: hidden; 
              border: 1px solid var(--border); transition: transform 0.3s, box-shadow 0.3s;
            }
            .card:hover { transform: translateY(-5px); box-shadow: 0 10px 30px rgba(0, 255, 136, 0.1); border-color: #333; }
            
            .card-img { width: 100%; height: 250px; object-fit: cover; background: #000; }
            .card-content { padding: 1.5rem; }
            .category { color: var(--accent); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
            .card h3 { font-size: 1.4rem; margin: 0.5rem 0; }
            .price { font-size: 1.5rem; font-weight: 800; color: var(--text); margin-bottom: 1rem; }
            
            .add-btn { 
              width: 100%; background: var(--text); color: #000; border: none; 
              padding: 1rem; border-radius: 8px; font-weight: 600; font-size: 1rem; 
              cursor: pointer; transition: 0.2s;
            }
            .add-btn:hover { background: var(--accent); transform: scale(1.02); }

            /* Slide-out Cart */
            .cart-overlay {
              position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
              opacity: 0; pointer-events: none; transition: 0.3s; z-index: 1000;
            }
            .cart-overlay.active { opacity: 1; pointer-events: all; }
            
            .cart-panel {
              position: fixed; top: 0; right: -400px; width: 400px; height: 100vh;
              background: var(--card-bg); z-index: 1001; transition: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
              border-left: 1px solid var(--border); display: flex; flex-direction: column;
            }
            .cart-panel.active { right: 0; }
            
            .cart-header { padding: 1.5rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
            .close-cart { background: none; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer; }
            
            .cart-items { flex: 1; overflow-y: auto; padding: 1.5rem; }
            .cart-item { display: flex; justify-content: space-between; margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem; }
            .cart-item-info h4 { margin-bottom: 0.2rem; }
            .cart-item-info p { color: var(--text-muted); font-size: 0.9rem; }
            .remove-item { background: none; border: none; color: #ff4d4d; cursor: pointer; font-size: 0.9rem; }
            
            .cart-footer { padding: 1.5rem; border-top: 1px solid var(--border); background: #111; }
            .cart-total { display: flex; justify-content: space-between; font-size: 1.3rem; font-weight: bold; margin-bottom: 1rem; }
            .checkout-btn { width: 100%; background: var(--accent); color: #000; border: none; padding: 1rem; border-radius: 8px; font-weight: bold; font-size: 1.1rem; cursor: pointer; }
            .checkout-btn:hover { background: var(--accent-hover); }
          </style>
        </head>
        <body>
          <header>
            <a href="/" class="logo">NEXUS<span>27</span></a>
            <button class="cart-btn" onclick="toggleCart()">
              🛒 Cart <span id="cart-count">0</span>
            </button>
          </header>

          <section class="hero">
            <h1>The Future is <span style="color:var(--accent)">Here</span>.</h1>
            <p>Experience the pinnacle of 2027 technology. Powered by next-gen AI, built for creators.</p>
          </section>

          <main class="container">
            <div class="grid" id="products">Loading...</div>
          </main>

          <!-- Cart UI -->
          <div class="cart-overlay" id="cart-overlay" onclick="toggleCart()"></div>
          <div class="cart-panel" id="cart-panel">
            <div class="cart-header">
              <h2>Your Cart</h2>
              <button class="close-cart" onclick="toggleCart()">✕</button>
            </div>
            <div class="cart-items" id="cart-items"></div>
            <div class="cart-footer">
              <div class="cart-total">
                <span>Total:</span>
                <span id="cart-total">$0</span>
              </div>
              <button class="checkout-btn" onclick="checkout()">Checkout Now</button>
            </div>
          </div>

          <script>
            let sessionToken = localStorage.getItem('sessionToken');
            if (!sessionToken) {
              sessionToken = Math.random().toString(36).substring(2);
              localStorage.setItem('sessionToken', sessionToken);
            }

            async function loadProducts() {
              try {
                const res = await fetch('/api/products');
                const json = await res.json();
                document.getElementById('products').innerHTML = json.data.map(p => \`
                  <div class="card">
                    <img src="\${p.image}" alt="\${p.name}" class="card-img" />
                    <div class="card-content">
                      <span class="category">\${p.category}</span>
                      <h3>\${p.name}</h3>
                      <div class="price">$\${p.price}</div>
                      <button class="add-btn" onclick="addToCart('\${p.id}')">Add to Cart</button>
                    </div>
                  </div>
                \`).join('');
              } catch (e) { console.error('Failed to load products', e); }
            }

            async function loadCart() {
              try {
                const res = await fetch('/api/cart', { headers: { 'Authorization': sessionToken } });
                const cart = await res.json();
                
                document.getElementById('cart-count').innerText = cart.items.reduce((acc, i) => acc + i.quantity, 0);
                document.getElementById('cart-total').innerText = '$' + cart.total;
                
                document.getElementById('cart-items').innerHTML = cart.items.map(i => \`
                  <div class="cart-item">
                    <div class="cart-item-info">
                      <h4>\${i.name}</h4>
                      <p>Qty: \${i.quantity} × $\${i.price}</p>
                    </div>
                    <button class="remove-item" onclick="removeFromCart('\${i.productId}')">Remove</button>
                  </div>
                \`).join('') || '<p style="color:var(--text-muted)">Your cart is empty.</p>';
              } catch (e) { console.error('Failed to load cart', e); }
            }

            async function addToCart(productId) {
              await fetch('/api/cart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': sessionToken },
                body: JSON.stringify({ productId, quantity: 1 })
              });
              loadCart();
              toggleCart(); // Open cart when adding
            }

            async function removeFromCart(productId) {
              await fetch('/api/cart/' + productId, {
                method: 'DELETE',
                headers: { 'Authorization': sessionToken }
              });
              loadCart();
            }

            async function checkout() {
              const res = await fetch('/api/checkout', { method: 'POST', headers: { 'Authorization': sessionToken } });
              const data = await res.json();
              if (res.ok) {
                alert('Success! Order ID: ' + data.orderId);
                loadCart();
                loadProducts();
                toggleCart();
              } else {
                alert('Error: ' + data.error);
              }
            }

            function toggleCart() {
              document.getElementById('cart-overlay').classList.toggle('active');
              document.getElementById('cart-panel').classList.toggle('active');
            }

            loadProducts();
            loadCart();
          </script>
        </body>
        </html>
      `);
    }

    // 2. GET /api/products
    if (path === '/api/products' && method === 'GET') {
      return sendJSON(res, 200, { total: db.products.length, data: db.products });
    }

    // 3. GET /api/cart
    if (path === '/api/cart' && method === 'GET') {
      const token = req.headers['authorization'];
      if (!token) return sendJSON(res, 401, { error: 'Unauthorized. Missing token.' });

      const userCart = db.carts[token] || [];
      const items = userCart.map(item => {
        const p = db.products.find(prod => prod.id === item.productId);
        return { productId: p.id, name: p.name, price: p.price, quantity: item.quantity, subtotal: p.price * item.quantity };
      });

      return sendJSON(res, 200, { items, total: getCartTotal(userCart) });
    }

    // 4. POST /api/cart (Add to cart)
    if (path === '/api/cart' && method === 'POST') {
      const token = req.headers['authorization'];
      if (!token) return sendJSON(res, 401, { error: 'Unauthorized. Missing token.' });

      const body = await parseBody(req);
      if (!body.productId || !body.quantity) {
        return sendJSON(res, 400, { error: 'productId and quantity are required' });
      }

      const product = db.products.find(p => p.id === body.productId);
      if (!product) return sendJSON(res, 404, { error: 'Product not found' });
      if (product.stock < body.quantity) return sendJSON(res, 400, { error: 'Not enough stock' });

      if (!db.carts[token]) db.carts[token] = [];
      
      const existingItem = db.carts[token].find(item => item.productId === body.productId);
      if (existingItem) {
        existingItem.quantity += body.quantity;
      } else {
        db.carts[token].push({ productId: body.productId, quantity: body.quantity });
      }

      return sendJSON(res, 200, { message: 'Added to cart successfully' });
    }

    // 5. DELETE /api/cart/:productId
    if (path.startsWith('/api/cart/') && method === 'DELETE') {
      const token = req.headers['authorization'];
      if (!token) return sendJSON(res, 401, { error: 'Unauthorized' });

      const productId = path.split('/')[3];
      if (db.carts[token]) {
        db.carts[token] = db.carts[token].filter(item => item.productId !== productId);
      }
      return sendJSON(res, 200, { message: 'Item removed from cart' });
    }

    // 6. POST /api/checkout
    if (path === '/api/checkout' && method === 'POST') {
      const token = req.headers['authorization'];
      if (!token) return sendJSON(res, 401, { error: 'Unauthorized' });

      const userCart = db.carts[token] || [];
      if (userCart.length === 0) return sendJSON(res, 400, { error: 'Cart is empty' });

      for (const item of userCart) {
        const product = db.products.find(p => p.id === item.productId);
        if (product.stock < item.quantity) {
          return sendJSON(res, 400, { error: `Out of stock: \${product.name}` });
        }
      }
      for (const item of userCart) {
        const product = db.products.find(p => p.id === item.productId);
        product.stock -= item.quantity;
      }

      const total = getCartTotal(userCart);
      db.carts[token] = []; // Clear cart

      return sendJSON(res, 200, { 
        message: 'Checkout successful!', 
        orderId: 'ORD-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        amountCharged: total
      });
    }

    return sendJSON(res, 404, { error: 'Route not found' });

  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: 'Internal Server Error' });
  }
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🛒 Premium E-commerce Server running on port ${PORT}`);
});
