-- 0005_seed_category_rules.sql — system default categorisation rules (user_id = null)
-- Safe to re-run: replaces the system default set, leaves user overrides intact.

delete from public.category_rules where user_id is null;

insert into public.category_rules (user_id, match_type, pattern, direction, category, priority) values
  -- online shopping
  (null,'contains','h&m','debit','online_shopping',10),
  (null,'contains','hnm','debit','online_shopping',10),
  (null,'contains','zara','debit','online_shopping',10),
  (null,'contains','uniqlo','debit','online_shopping',10),
  (null,'contains','myntra','debit','online_shopping',10),
  (null,'contains','ajio','debit','online_shopping',10),
  (null,'contains','amazon','debit','online_shopping',20),
  (null,'contains','flipkart','debit','online_shopping',20),
  -- grocery / quick-commerce / food delivery
  (null,'contains','swiggy','debit','grocery',10),
  (null,'contains','instamart','debit','grocery',10),
  (null,'contains','blinkit','debit','grocery',10),
  (null,'contains','zepto','debit','grocery',10),
  (null,'contains','zomato','debit','grocery',10),
  (null,'contains','bigbasket','debit','grocery',10),
  (null,'contains','dunzo','debit','grocery',20),
  -- dineout / restaurants / stays
  (null,'contains','restaurant','debit','dineout',30),
  (null,'contains','hotel','debit','dineout',30),
  (null,'contains','cafe','debit','dineout',30),
  (null,'contains','coffee','debit','dineout',40),
  (null,'contains','villa','debit','dineout',30),
  (null,'contains','airbnb','debit','dineout',20),
  -- alcohol
  (null,'contains','wine','debit','alcohol',10),
  (null,'contains','liquor','debit','alcohol',10),
  (null,'contains','beer','debit','alcohol',10),
  (null,'contains','madhuloka','debit','alcohol',10),
  -- ticket booking
  (null,'contains','bookmyshow','debit','ticket_booking',10),
  (null,'contains','district','debit','ticket_booking',10),
  (null,'contains','pvr','debit','ticket_booking',20),
  (null,'contains','inox','debit','ticket_booking',20),
  -- credits
  (null,'contains','refund','credit','refund',10),
  (null,'contains','reversal','credit','refund',10),
  (null,'contains','reversed','credit','refund',10);
