/**
 * Initial Catalog & Demo Data Seeder
 */

const { db, run, queryOne } = require('./db');

function seedData() {
  const existingProducts = queryOne('SELECT COUNT(*) as count FROM products');
  if (existingProducts.count > 0 || queryOne('SELECT COUNT(*) AS count FROM categories').count > 0) {
    console.log('Database already contains products. Skipping seed.');
    return;
  }

  console.log('Seeding initial e-commerce catalog...');
  db.exec('BEGIN IMMEDIATE');
  try {

  // 1. Categories
  const categories = [
    {
      name: 'Audio & Sound',
      slug: 'audio',
      description: 'High-fidelity headphones, studio monitors, and wireless earbuds for audiophiles.',
      icon: 'headphones'
    },
    {
      name: 'Wearables & Tech',
      slug: 'wearables',
      description: 'Smartwatches, fitness trackers, and intelligent personal assistants.',
      icon: 'watch'
    },
    {
      name: 'Workspace & Ergonomics',
      slug: 'workspace',
      description: 'Mechanical keyboards, precision mice, ambient lighting, and desk essentials.',
      icon: 'monitor'
    },
    {
      name: 'Photography & Gear',
      slug: 'photography',
      description: 'Compact mirrorless cameras, prime lenses, and professional accessories.',
      icon: 'camera'
    },
    {
      name: 'Travel & Everyday Carry',
      slug: 'travel',
      description: 'Weatherproof backpacks, tech organizers, and modular EDC gear.',
      icon: 'briefcase'
    }
  ];

  const insertCategory = db.prepare(`
    INSERT INTO categories (name, slug, description, icon)
    VALUES (?, ?, ?, ?)
  `);

  categories.forEach(cat => {
    insertCategory.run(cat.name, cat.slug, cat.description, cat.icon);
  });

  // 2. Products
  const products = [
    {
      name: 'Aura Pro Wireless ANC Headphones',
      slug: 'aura-pro-wireless-anc-headphones',
      category: 'Audio & Sound',
      price: 299.99,
      compare_at_price: 349.99,
      cost_price: 140.00,
      stock: 42,
      description: 'Engineered for pristine acoustics. The Aura Pro delivers studio-grade active noise cancellation, 40mm custom biocellulose drivers, and up to 48 hours of continuous battery life.',
      features_json: JSON.stringify([
        'Adaptive Hybrid Active Noise Cancellation',
        '40mm Custom Bio-Cellulose Dynamic Drivers',
        '48-Hour Battery with Fast Charge (10 min = 5 hours)',
        'Ultra-soft memory foam protein leather ear cushions',
        'Multipoint Bluetooth 5.3 connection with LDAC support'
      ]),
      specs_json: JSON.stringify({
        'Frequency Response': '10Hz - 40,000Hz',
        'Weight': '250g',
        'Charging': 'USB-C & Qi Wireless',
        'Warranty': '2 Years Global'
      }),
      image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80',
      gallery_json: JSON.stringify([
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80',
        'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800&q=80',
        'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&q=80'
      ]),
      rating: 4.9,
      review_count: 128,
      is_featured: 1
    },
    {
      name: 'Vanguard Chrono Smartwatch Ultra',
      slug: 'vanguard-chrono-smartwatch-ultra',
      category: 'Wearables & Tech',
      price: 389.00,
      compare_at_price: 449.00,
      cost_price: 185.00,
      stock: 19,
      description: 'Aerospace-grade titanium chassis with scratch-resistant sapphire crystal. Tracks heart rate variability, SpO2, sleep stages, and precision dual-frequency GPS routing.',
      features_json: JSON.stringify([
        'Grade 5 Titanium bezel with DLC coating',
        'Always-On 1.43-inch AMOLED display (1,200 nits)',
        'Dual-band GNSS multi-satellite positioning',
        '100-meter water resistance (10 ATM)',
        '14-day typical battery endurance'
      ]),
      specs_json: JSON.stringify({
        'Case Size': '47mm',
        'Screen': '1.43" AMOLED 466x466',
        'Sensors': 'Optical Heart, SpO2, ECG, Barometer',
        'Connectivity': 'Bluetooth 5.3, Wi-Fi, NFC'
      }),
      image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80',
      gallery_json: JSON.stringify([
        'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80',
        'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&q=80'
      ]),
      rating: 4.8,
      review_count: 94,
      is_featured: 1
    },
    {
      name: 'ErgoType Pro Split Mechanical Keyboard',
      slug: 'ergotype-pro-split-mechanical-keyboard',
      category: 'Workspace & Ergonomics',
      price: 219.00,
      compare_at_price: 249.00,
      cost_price: 95.00,
      stock: 35,
      description: 'Columnar layout with hot-swappable tactile switches, programmable OLED macro displays, and aircraft-grade aluminum top plate for ergonomic typing all day.',
      features_json: JSON.stringify([
        'True split ortholinear ergonomic design',
        'Hot-swappable Kailh Box tactile silent switches',
        'Per-key RGB with VIA & QMK custom firmware support',
        'CNC machined anodized aluminum enclosure',
        'Detachable magnetic memory foam palm rests'
      ]),
      specs_json: JSON.stringify({
        'Keycaps': 'PBT Double-shot Cherry Profile',
        'Polling Rate': '1000Hz Ultra-low latency',
        'Connection': 'Tri-mode (USB-C, 2.4GHz, Bluetooth)'
      }),
      image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&q=80',
      gallery_json: JSON.stringify([
        'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&q=80',
        'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=800&q=80'
      ]),
      rating: 4.95,
      review_count: 82,
      is_featured: 1
    },
    {
      name: 'Lumix Prime 35mm F/1.4 Mirrorless Lens',
      slug: 'lumix-prime-35mm-mirrorless-lens',
      category: 'Photography & Gear',
      price: 649.00,
      compare_at_price: 699.00,
      cost_price: 360.00,
      stock: 12,
      description: 'Exceptional optical clarity from center to edge. Features two extra-low dispersion glass elements, fluorine weather sealing, and ultra-quiet linear stepping autofocus.',
      features_json: JSON.stringify([
        'Fast f/1.4 maximum aperture for creamy bokeh',
        'Nano AR II multi-coating suppresses flare & ghosting',
        'Weather-sealed dust and moisture resistant body',
        '9-blade circular aperture diaphragm',
        'Internal focus mechanism with zero barrel extension'
      ]),
      specs_json: JSON.stringify({
        'Mount': 'Universal E-Mount / L-Mount',
        'Filter Diameter': '67mm',
        'Weight': '420g',
        'Min Focus Distance': '0.28m'
      }),
      image_url: 'https://images.unsplash.com/photo-1617005082133-548c4dd27f35?w=800&q=80',
      gallery_json: JSON.stringify([
        'https://images.unsplash.com/photo-1617005082133-548c4dd27f35?w=800&q=80'
      ]),
      rating: 4.7,
      review_count: 45,
      is_featured: 0
    },
    {
      name: 'Nomad 28L Weatherproof Commuter Pack',
      slug: 'nomad-28l-weatherproof-commuter-pack',
      category: 'Travel & Everyday Carry',
      price: 165.00,
      compare_at_price: 195.00,
      cost_price: 65.00,
      stock: 58,
      description: 'Crafted from Cordura 500D recycled nylon with Aquaguard YKK zippers. Dedicated padded compartment fits up to 16-inch laptops with quick TSA-compliant lay-flat access.',
      features_json: JSON.stringify([
        'Waterproof Cordura 500D ballistic exterior',
        'Dedicated suspended 16" laptop sleeve',
        'Ergonomic breathable EVA back ventilation panel',
        'Concealed RFID-blocking passport & wallet pocket',
        'Magnetic Fidlock sternum strap & luggage pass-through'
      ]),
      specs_json: JSON.stringify({
        'Capacity': '28 Liters',
        'Dimensions': '49 x 31 x 18 cm',
        'Weight': '1.15 kg'
      }),
      image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
      gallery_json: JSON.stringify([
        'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
        'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=800&q=80'
      ]),
      rating: 4.88,
      review_count: 210,
      is_featured: 1
    },
    {
      name: 'SonicWave Studio Reference Monitors (Pair)',
      slug: 'sonicwave-studio-reference-monitors',
      category: 'Audio & Sound',
      price: 349.99,
      compare_at_price: 399.99,
      cost_price: 160.00,
      stock: 14,
      description: 'Precision nearfield monitors featuring 5-inch Kevlar woofers, 1-inch silk dome tweeters, and Class-D bi-amplification delivering a flat, uncolored frequency response.',
      features_json: JSON.stringify([
        '100W Total Bi-Amplified Class-D output',
        'Custom woven 5" Kevlar cone woofer',
        'Room acoustic compensation EQ dipswitches',
        'Balanced XLR and 1/4" TRS balanced inputs',
        'Acoustically inert MDF cabinet with front-firing bass port'
      ]),
      specs_json: JSON.stringify({
        'Frequency Range': '48Hz - 22,000Hz',
        'Max SPL': '108 dB',
        'Dimensions (each)': '260 x 180 x 200 mm'
      }),
      image_url: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&q=80',
      gallery_json: JSON.stringify([
        'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&q=80'
      ]),
      rating: 4.65,
      review_count: 37,
      is_featured: 0
    },
    {
      name: 'Apex Lightbar Pro Screen Lamp',
      slug: 'apex-lightbar-pro-screen-lamp',
      category: 'Workspace & Ergonomics',
      price: 89.00,
      compare_at_price: 109.00,
      cost_price: 38.00,
      stock: 75,
      description: 'Asymmetric optical design illuminates your desktop without screen glare. Touch controls adjust color temperature from 2700K warm candle to 6500K crisp daylight.',
      features_json: JSON.stringify([
        'Patented asymmetric light beam prevents glare',
        'Stepless color temperature adjustment (2700K-6500K)',
        'Ra95 Ultra-high color rendering index (CRI)',
        'Wireless desktop rotary control dial',
        'USB-C powered directly from monitor or dock'
      ]),
      specs_json: JSON.stringify({
        'Power': '5W USB 5V/1A',
        'Length': '45 cm',
        'Mounting': 'Gravity counterweight clamp (fits 5-45mm screens)'
      }),
      image_url: 'https://images.unsplash.com/photo-1593062096033-9a26b09da705?w=800&q=80',
      gallery_json: JSON.stringify([
        'https://images.unsplash.com/photo-1593062096033-9a26b09da705?w=800&q=80'
      ]),
      rating: 4.9,
      review_count: 142,
      is_featured: 0
    },
    {
      name: 'Carbon Fiber MagSafe Minimalist Wallet',
      slug: 'carbon-fiber-magsafe-minimalist-wallet',
      category: 'Travel & Everyday Carry',
      price: 54.00,
      compare_at_price: 65.00,
      cost_price: 18.00,
      stock: 95,
      description: '3K matte real carbon fiber plates wrapped in elastic webbing. Holds up to 12 cards and folded bills with full RFID protection and strong MagSafe magnetic alignment.',
      features_json: JSON.stringify([
        'Authentic 3K aerospace-grade carbon fiber',
        'Integrated N52 rare-earth MagSafe magnet array',
        'RFID/NFC skimming protection',
        'Integrated titanium cash strap & money clip',
        'Slim 6mm profile when loaded with 6 cards'
      ]),
      specs_json: JSON.stringify({
        'Weight': '48g',
        'Card Capacity': '1 to 12 cards',
        'Compatibility': 'iPhone 12-16 & MagSafe cases'
      }),
      image_url: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&q=80',
      gallery_json: JSON.stringify([
        'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&q=80'
      ]),
      rating: 4.75,
      review_count: 67,
      is_featured: 0
    }
  ];

  const insertProduct = db.prepare(`
    INSERT INTO products (
      name, slug, category, price, compare_at_price, cost_price, stock,
      description, features_json, specs_json, image_url, gallery_json,
      rating, review_count, is_featured
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  products.forEach(p => {
    insertProduct.run(
      p.name, p.slug, p.category, p.price, p.compare_at_price, p.cost_price, p.stock,
      p.description, p.features_json, p.specs_json, p.image_url, p.gallery_json,
      p.rating, p.review_count, p.is_featured
    );
  });

  // 3. Coupons
  const coupons = [
    { code: 'WELCOME10', discount_type: 'percent', value: 10, min_subtotal: 50 },
    { code: 'FREESHIP', discount_type: 'fixed', value: 7.99, min_subtotal: 30 },
    { code: 'VIP25', discount_type: 'percent', value: 25, min_subtotal: 200 }
  ];

  const insertCoupon = db.prepare(`
    INSERT INTO coupons (code, discount_type, value, min_subtotal)
    VALUES (?, ?, ?, ?)
  `);

  coupons.forEach(c => {
    insertCoupon.run(c.code, c.discount_type, c.value, c.min_subtotal);
  });

  // 4. Sample Orders (To populate Admin Dashboard analytics immediately)
  const sampleOrders = [
    {
      order_number: 'ORD-98214',
      customer_name: 'Sophia Reynolds',
      customer_email: 'sophia.reynolds@example.com',
      customer_phone: '+1 (555) 234-5678',
      shipping_address: '742 Evergreen Terrace',
      city: 'Seattle',
      state: 'WA',
      postal_code: '98101',
      country: 'United States',
      items_json: JSON.stringify([
        { id: 1, name: 'Aura Pro Wireless ANC Headphones', price: 299.99, quantity: 1 }
      ]),
      subtotal: 299.99,
      discount: 30.00,
      shipping_fee: 0,
      tax: 21.60,
      total: 291.59,
      status: 'delivered',
      tracking_number: 'TRK-USPS-849102834',
      carrier: 'USPS Priority'
    },
    {
      order_number: 'ORD-98215',
      customer_name: 'Marcus Chen',
      customer_email: 'marcus.chen@example.com',
      customer_phone: '+1 (555) 876-5432',
      shipping_address: '120 Market Street, Suite 400',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94105',
      country: 'United States',
      items_json: JSON.stringify([
        { id: 2, name: 'Vanguard Chrono Smartwatch Ultra', price: 389.00, quantity: 1 },
        { id: 7, name: 'Apex Lightbar Pro Screen Lamp', price: 89.00, quantity: 1 }
      ]),
      subtotal: 478.00,
      discount: 0,
      shipping_fee: 0,
      tax: 38.24,
      total: 516.24,
      status: 'shipped',
      tracking_number: 'TRK-FEDEX-992817263',
      carrier: 'FedEx Express'
    },
    {
      order_number: 'ORD-98216',
      customer_name: 'Elena Rostova',
      customer_email: 'elena.rostova@example.com',
      customer_phone: '+1 (555) 432-1098',
      shipping_address: '450 North Michigan Ave',
      city: 'Chicago',
      state: 'IL',
      postal_code: '60611',
      country: 'United States',
      items_json: JSON.stringify([
        { id: 5, name: 'Nomad 28L Weatherproof Commuter Pack', price: 165.00, quantity: 1 },
        { id: 8, name: 'Carbon Fiber MagSafe Minimalist Wallet', price: 54.00, quantity: 1 }
      ]),
      subtotal: 219.00,
      discount: 21.90,
      shipping_fee: 0,
      tax: 15.77,
      total: 212.87,
      status: 'processing',
      tracking_number: null,
      carrier: null
    },
    {
      order_number: 'ORD-98217',
      customer_name: 'David Vance',
      customer_email: 'david.vance@example.com',
      customer_phone: '+1 (555) 321-9876',
      shipping_address: '880 Ocean Drive, Apt 12B',
      city: 'Miami',
      state: 'FL',
      postal_code: '33139',
      country: 'United States',
      items_json: JSON.stringify([
        { id: 3, name: 'ErgoType Pro Split Mechanical Keyboard', price: 219.00, quantity: 1 }
      ]),
      subtotal: 219.00,
      discount: 0,
      shipping_fee: 0,
      tax: 17.52,
      total: 236.52,
      status: 'pending',
      tracking_number: null,
      carrier: null
    }
  ];

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      order_number, customer_name, customer_email, customer_phone,
      shipping_address, city, state, postal_code, country,
      items_json, subtotal, discount, shipping_fee, tax, total,
      status, tracking_number, carrier
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  sampleOrders.forEach(o => {
    insertOrder.run(
      o.order_number, o.customer_name, o.customer_email, o.customer_phone,
      o.shipping_address, o.city, o.state, o.postal_code, o.country,
      o.items_json, o.subtotal, o.discount, o.shipping_fee, o.tax, o.total,
      o.status, o.tracking_number, o.carrier
    );
  });

  // 5. Sample Reviews
  const insertReview = db.prepare(`
    INSERT INTO reviews (product_id, author_name, rating, comment)
    VALUES (?, ?, ?, ?)
  `);

  insertReview.run(1, 'Alex M.', 5, 'The active noise cancellation is stunning. Better than my Sony XM5s on long flights.');
  insertReview.run(1, 'Sarah T.', 5, 'Battery genuinely lasted me almost the entire week of daily work calls and commute.');
  insertReview.run(2, 'Jordan K.', 5, 'The titanium case feels indistinguishable from a $1,500 luxury timepiece. Superb.');
  insertReview.run(3, 'Devin P.', 5, 'Completely eliminated my wrist pain after switching to this split layout.');

  db.exec("UPDATE orders SET payment_status = 'mock'");
  console.log('Seed completed successfully! Added:');
  console.log(`- ${categories.length} categories`);
  console.log(`- ${products.length} products`);
  console.log(`- ${coupons.length} promotional coupons`);
  console.log(`- ${sampleOrders.length} sample demo orders`);
  db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

if (require.main === module) {
  seedData();
}

module.exports = { seedData };
