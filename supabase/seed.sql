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
values (1, 'MAD', 'ar-MA', 'Aziz', 'Africa/Casablanca')
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
  ('مشروبات',         'ماء، مشروبات غازية، عصير، شاي، قهوة',          10),
  ('منتجات الألبان',  'حليب، جبن، زبادي، زبدة، كريمة',                 20),
  ('بقالة جافة',      'أرز، معكرونة، دقيق، سكر، زيت، سميد',            30),
  ('معلبات',          'تونة، سردين، صلصة طماطم، خضروات معلبة',         40),
  ('فواكه وخضروات',   'فواكه وخضروات طازجة',                            50),
  ('خبز ومخبوزات',    'خبز، معجنات، كعك',                               60),
  ('حلوى وسناكس',     'حلوى، شوكولاتة، شيبس، بسكويت',                  70),
  ('منتجات التنظيف',  'جافيل، منظف، إسفنج، أكياس القمامة',             80),
  ('نظافة وتجميل',    'صابون، شامبو، معجون أسنان، حفاضات',              90),
  ('مجمدات',          'آيس كريم، خضروات مجمدة، سمك مجمد',             100),
  ('تبغ',             'سجائر، تبغ',                                    110),
  ('متنوعات',         'كل ما لا يدخل في الأقسام الأخرى',               120)
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
  ('رواتب',           'operating',  true,  10),
  ('إيجار',           'operating',  true,  20),
  ('كهرباء وماء',     'operating',  true,  30),
  ('نقل وتوصيل',      'operating',  true,  40),
  ('ضرائب ورسوم',     'operating',  true,  50),
  ('صيانة وإصلاحات',  'operating',  true,  60),
  ('هاتف وإنترنت',    'operating',  true,  70),
  ('تغليف ولوازم',    'operating',  true,  80),
  ('مصاريف شخصية',    'owner_draw', true,  90),
  ('مصاريف عائلية',   'owner_draw', true, 100),
  ('مناسبات خاصة',    'owner_draw', true, 110),
  ('أخرى',            'operating',  true, 120)
on conflict (name) do nothing;
