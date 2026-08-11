-- Phase 8c+8d — Arabic category names and locale.
--
-- Renames every article_category and charge_category from French to Arabic
-- (owner-approved names, current_state.md Entry 14 / Entry 15), updates the
-- article_category descriptions, and switches app_settings.locale to 'ar-MA'.
--
-- 'ar-MA' uses Western digits (0–9) with Arabic decimal/thousands separators,
-- which matches receipts and calculators familiar to Moroccan users.
--
-- This migration is applied to aziz-dev by Amer. Apply to aziz-prod once it
-- exists.

-- ---------------------------------------------------------------------------
-- Article categories — names and descriptions
-- ---------------------------------------------------------------------------

update article_category set
  name        = 'مشروبات',
  description = 'ماء، مشروبات غازية، عصير، شاي، قهوة'
where name = 'Boissons';

update article_category set
  name        = 'منتجات الألبان',
  description = 'حليب، جبن، زبادي، زبدة، كريمة'
where name = 'Produits laitiers';

update article_category set
  name        = 'بقالة جافة',
  description = 'أرز، معكرونة، دقيق، سكر، زيت، سميد'
where name = 'Épicerie sèche';

update article_category set
  name        = 'معلبات',
  description = 'تونة، سردين، صلصة طماطم، خضروات معلبة'
where name = 'Conserves';

update article_category set
  name        = 'فواكه وخضروات',
  description = 'فواكه وخضروات طازجة'
where name = 'Fruits et légumes';

update article_category set
  name        = 'خبز ومخبوزات',
  description = 'خبز، معجنات، كعك'
where name = 'Pain et pâtisserie';

update article_category set
  name        = 'حلوى وسناكس',
  description = 'حلوى، شوكولاتة، شيبس، بسكويت'
where name = 'Confiserie et snacks';

update article_category set
  name        = 'منتجات التنظيف',
  description = 'جافيل، منظف، إسفنج، أكياس القمامة'
where name = 'Produits d''entretien';

update article_category set
  name        = 'نظافة وتجميل',
  description = 'صابون، شامبو، معجون أسنان، حفاضات'
where name = 'Hygiène et cosmétique';

update article_category set
  name        = 'مجمدات',
  description = 'آيس كريم، خضروات مجمدة، سمك مجمد'
where name = 'Surgelés';

update article_category set
  name        = 'تبغ',
  description = 'سجائر، تبغ'
where name = 'Tabac';

update article_category set
  name        = 'متنوعات',
  description = 'كل ما لا يدخل في الأقسام الأخرى'
where name = 'Divers';

-- ---------------------------------------------------------------------------
-- Charge categories — names only (no description column)
-- ---------------------------------------------------------------------------

update charge_category set name = 'رواتب'           where name = 'Salaires';
update charge_category set name = 'إيجار'            where name = 'Loyer';
update charge_category set name = 'كهرباء وماء'      where name = 'Électricité et eau';
update charge_category set name = 'نقل وتوصيل'       where name = 'Transport et livraison';
update charge_category set name = 'ضرائب ورسوم'      where name = 'Taxes et licences';
update charge_category set name = 'صيانة وإصلاحات'   where name = 'Entretien et réparations';
update charge_category set name = 'هاتف وإنترنت'     where name = 'Téléphone et internet';
update charge_category set name = 'تغليف ولوازم'     where name = 'Emballage et fournitures';
update charge_category set name = 'مصاريف شخصية'     where name = 'Dépenses personnelles';
update charge_category set name = 'مصاريف عائلية'    where name = 'Dépenses familiales';
update charge_category set name = 'مناسبات خاصة'     where name = 'Événements exceptionnels';
update charge_category set name = 'أخرى'             where name = 'Autres';

-- ---------------------------------------------------------------------------
-- Settings — switch locale to Moroccan Arabic
-- ---------------------------------------------------------------------------

update app_settings set locale = 'ar-MA' where id = 1;
