-- seed.sql — starting reference data. All of it is editable in the app.
--
-- domain-spec §2.2, §5.2.
--
-- Idempotent: safe to re-run. `on conflict do nothing` on the unique names means
-- a re-seed never duplicates and never overwrites an edit the owner has made.

-- ---------------------------------------------------------------------------
-- Settings singleton
-- ---------------------------------------------------------------------------

insert into app_settings (id, currency_code, locale, store_name, timezone)
values (1, 'MAD', 'fr', 'Aziz', 'Africa/Casablanca')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Article categories
--
-- The `description` is not decoration. It is read out in the stock-count
-- question so the user knows the WHOLE shelf is being asked about, not the crate
-- in their hands (domain-spec §1.4 item 5). How well these match the real
-- shelves decides how often that trap springs — the owner should review them.
-- ---------------------------------------------------------------------------

insert into article_category (name, description, sort_order) values
  ('Boissons',                 'eau, sodas, jus, thé, café',                     10),
  ('Produits laitiers',        'lait, fromage, yaourt, beurre, crème',           20),
  ('Épicerie sèche',           'riz, pâtes, farine, sucre, huile, semoule',      30),
  ('Conserves',                'thon, sardines, tomate, légumes en boîte',       40),
  ('Fruits et légumes',        'fruits et légumes frais',                        50),
  ('Pain et pâtisserie',       'pain, viennoiseries, gâteaux',                   60),
  ('Confiserie et snacks',     'bonbons, chocolat, chips, biscuits',             70),
  ('Produits d''entretien',    'javel, détergent, éponges, sacs poubelle',       80),
  ('Hygiène et cosmétique',    'savon, shampoing, dentifrice, couches',          90),
  ('Surgelés',                 'glaces, légumes surgelés, poisson surgelé',     100),
  ('Tabac',                    'cigarettes, tabac',                             110),
  ('Divers',                   'tout ce qui n''entre pas dans les autres rayons', 120)
on conflict (name) do nothing;

-- Every category starts at 20%, effective from its creation date.
--
-- "20% markup on COST" means buy at 100, sell at 120. It does NOT mean 20% of
-- the selling price — the two readings differ by 25% on the profit figure, and
-- shopkeepers use both phrasings (domain-spec §1.3).
insert into markup_rate (category_id, markup_pct, effective_from)
select c.id, 20.00, c.created_at::date
from article_category c
where not exists (
  select 1 from markup_rate m where m.category_id = c.id
);

-- ---------------------------------------------------------------------------
-- Charge categories
--
-- `nature` decides which side of the profit chain a charge lands on:
--   operating   — a cost of running the store. Answers "is the business healthy?"
--   owner_draw  — the owner taking money out. Answers "did my wallet grow?"
-- Never summed into one number.
-- ---------------------------------------------------------------------------

insert into charge_category (name, nature, is_system, sort_order) values
  ('Salaires',                    'operating',  true,  10),
  ('Loyer',                       'operating',  true,  20),
  ('Électricité et eau',          'operating',  true,  30),
  ('Transport et livraison',      'operating',  true,  40),
  ('Taxes et licences',           'operating',  true,  50),
  ('Entretien et réparations',    'operating',  true,  60),
  ('Téléphone et internet',       'operating',  true,  70),
  ('Emballage et fournitures',    'operating',  true,  80),
  ('Dépenses personnelles',       'owner_draw', true,  90),
  ('Dépenses familiales',         'owner_draw', true, 100),
  ('Événements exceptionnels',    'owner_draw', true, 110),
  ('Autres',                      'operating',  true, 120)
on conflict (name) do nothing;
