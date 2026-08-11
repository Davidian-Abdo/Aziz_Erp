/*
 * Arabic copy. Additive to `fr` (plan §1.2, Q4 / Phase 8).
 *
 * The wording of `money.modelled*` and `onboarding.*` is not free text — it is
 * specified in domain-spec §7.2 and §3.5 respectively, and it is what keeps an
 * estimate from being read as a measurement.
 */
export const ar = {
  translation: {
    app: {
      name: 'Aziz ERP',
      loading: 'جار التحميل…',
    },

    money: {
      // domain-spec §7.2 — the tooltip on every modelled figure.
      modelledHint: 'تقدير، محسوب بناءً على الهامش المضبوط. ليس رقمًا حقيقيًا.',
      modelledHintWithMarkup: 'تقدير، محسوب بناءً على هامش {{markup, number}} %.',
      modelledLabel: 'تقدير',
      measuredLabel: 'مبلغ فعلي',
    },

    login: {
      title: 'تسجيل الدخول',
      subtitle: 'هذه المنطقة مخصصة لمدير المتجر.',
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      submit: 'تسجيل الدخول',
      submitting: 'جار الاتصال…',
      // Deliberately does not say which of the two was wrong.
      failed: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      offline: 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.',
      noAccess: 'هذا الحساب لا يملك صلاحية الوصول إلى هذا المتجر. تواصل مع المدير ليضيفك.',
    },

    nav: {
      dashboard: 'لوحة المعلومات',
      purchases: 'المشتريات',
      charges: 'المصاريف',
      counts: 'الجرد',
      losses: 'الخسائر',
      settings: 'الإعدادات',
      signOut: 'تسجيل الخروج',
    },

    onboarding: {
      title: 'فتح الحسابات',
      // domain-spec §3.5 — why the user is being asked this before anything else.
      intro:
        'قبل البدء، يجب معرفة ما يوجد في المتجر اليوم. لكل قسم، أدخل قيمة المخزون بسعر الشراء — ما دفعته أنت، لا ما تبيعه.',
      wholeShelf: 'القسم كله، لا منتجًا واحدًا فقط.',
      dateLabel: 'تاريخ الجرد',
      skipCategory: 'لا أبيع هذا القسم',
      skipped: 'القسم معطَّل',
      undoSkip: 'استعادة',
      submit: 'فتح الحسابات',
      submitting: 'جار الحفظ…',
      incomplete: 'أدخل كل قسم، أو عطِّل الأقسام التي لا تبيعها.',
      failed: 'فشل الحفظ. لم يُسجَّل شيء — يمكنك المحاولة مجددًا.',
      total: 'إجمالي قيمة المخزون',
    },

    common: {
      next: 'التالي',
      back: 'رجوع',
      cancel: 'إلغاء',
      delete: 'حذف',
      noteOptional: 'ملاحظة (اختياري)',
      unknownAmount: 'مبلغ غير محدد',
    },

    date: {
      today: 'اليوم',
      yesterday: 'أمس',
    },

    amount: {
      error: {
        empty: 'أدخل مبلغًا.',
        not_a_number: 'هذا المبلغ ليس رقمًا. مثال: 1 250,00',
        negative: 'لا يمكن أن يكون المبلغ سالبًا.',
        not_positive: 'يجب أن يكون المبلغ أكبر من صفر.',
        // domain-spec §9.1: money is numeric(14,2). A third decimal would be
        // rounded away by the database without telling anyone.
        too_precise: 'خانتان عشريتان كحد أقصى.',
      },
    },

    recent: {
      empty: 'لا شيء مسجَّل حتى الآن.',
    },

    write: {
      error: {
        future: 'هذا التاريخ في المستقبل. يمكنك إدخال تاريخ ماضٍ، لا مستقبلي.',
        duplicateCount: 'يوجد جرد بالفعل لهذا القسم في هذا التاريخ.',
        countRequired: 'هذا الشراء هو آخر حدث لهذا القسم: الجرد إلزامي.',
        countOnBackdated: 'هذا الشراء سابق لآخر جرد لهذا القسم: لا يمكن إرفاق جرد به.',
        notAuthorised: 'هذا الحساب لا يملك صلاحية الوصول إلى هذا المتجر.',
        offline: 'تعذر الوصول إلى الخادم. لم يُسجَّل شيء — أعد المحاولة.',
        // The one thing the user must be sure of, whatever went wrong.
        unknown: 'فشل الحفظ. لم يُسجَّل شيء — يمكنك المحاولة مجددًا.',
      },
    },

    purchases: {
      category: 'القسم',
      categoryPlaceholder: 'اختر قسمًا',
      categoryRequired: 'اختر قسمًا.',
      date: 'تاريخ الشراء',
      amount: 'المبلغ المدفوع',
      amountHint: 'ما دفعته للمورد، لا سعر البيع.',
      // domain-spec §3.2A — this wording is binding, not editorial.
      wholeShelf: 'القسم كاملًا: {{category}}',
      notOnlyWhatYouBought: 'لا ما اشتريته للتو فحسب.',
      howMuchWasLeft: 'كم كان متبقيًا، بسعر الشراء؟',
      shelfWasEmpty: 'لا شيء، كان القسم فارغًا',
      somethingWasLeft: 'كان هناك شيء متبقٍّ',
      priorStockLabel: 'القيمة المتبقية، بسعر الشراء',
      expectedPrefix: 'بحسب سجلاتك، ينبغي أن يحتوي هذا القسم على حوالي',
      // domain-spec §3.2, backdating exception.
      backdated: 'هذا الشراء سابق لآخر جرد لهذا القسم ({{date}})؛ لن يُسجَّل أي جرد.',
      save: 'حفظ الشراء',
      saving: 'جار الحفظ…',
      saved: 'تم حفظ الشراء.',
      // The idempotency cache answered instead of a second write (plan §2.12).
      savedReplayed: 'هذا الشراء مسجَّل مسبقًا. لم يُضَف شيء في المرة الثانية.',
      recent: 'آخر المشتريات',
      noCountAttached: 'بدون جرد',
      deleteTitle: 'حذف هذا الشراء؟',
      deleteBody: 'سيُحذَف الجرد المسجَّل مع هذا الشراء أيضًا. ستُعاد حسابات التقارير.',
    },

    plausibility: {
      title: 'هذا الرقم يبدو غير عادي',
      entered: 'أدخلت',
      butExpected: '، لكن {{category}} ينبغي أن يحتوي على حوالي',
      verdict: {
        exceeds_bound:
          'هذا أكثر مما يمكن أن يحتوي عليه القسم بحسب سجلاتك: ربما يكون شراء مفقودًا، أو المبلغ خاطئ.',
        high_outflow: 'هذا انخفاض غير عادي نسبةً إلى عدد الأيام المنقضية منذ آخر جرد.',
        suspicious_drop: 'هذا أقل بكثير مما كان متوقعًا، مع أن آخر جرد كان قريبًا جدًا.',
        ok: '',
      },
      heuristic: 'هذا مجرد فحص إرشادي: إذا كان رقمك صحيحًا، سجِّله.',
      fix: 'تصحيح',
      saveAnyway: 'حفظ على أي حال',
    },

    counts: {
      mode: 'نوع الإدخال',
      modeSingle: 'قسم واحد',
      modeSweep: 'جميع الأقسام',
      category: 'القسم',
      categoryPlaceholder: 'اختر قسمًا',
      categoryRequired: 'اختر قسمًا.',
      date: 'تاريخ الجرد',
      valueLabel: 'القيمة بسعر الشراء',
      wholeShelfHint: 'القسم كله، بسعر الشراء — لا منتجًا واحدًا فقط.',
      previous: 'آخر جرد ({{date}}):',
      neverCounted: 'لم يُجرَّد هذا القسم قط.',
      total: 'إجمالي قيمة المخزون',
      sweepIntro: 'جرد نهاية الشهر: أدخل كل قسم، يُسجَّل الكل دفعةً واحدة.',
      sweepIncomplete: 'أدخل كل قسم قبل الحفظ.',
      save: 'حفظ الجرد',
      saveSweep: 'حفظ جميع الجردات',
      saving: 'جار الحفظ…',
      saved: 'تم حفظ الجرد.',
      sweepSaved: 'تم حفظ {{n}} جردة.',
      savedReplayed: 'هذا الجرد مسجَّل مسبقًا. لم يُضَف شيء في المرة الثانية.',
      recent: 'آخر الجردات',
      source: {
        standalone: 'جرد',
        purchase: 'مع شراء',
      },
      deleteTitle: 'حذف هذا الجرد؟',
      deleteBody: 'ستُعاد حسابات الفترة التي يغطيها هذا الجرد انطلاقًا من الجرد السابق.',
      // domain-spec §4.3 — asked at the shelf, skippable in one tap.
      lossPromptTitle: 'هل فُقد شيء؟',
      lossPromptBody:
        'منذ آخر جرد، هل كانت هناك منتجات تالفة أو مكسورة أو مسروقة أو أُخذت للمنزل؟ بدون هذه المعلومة، ستُحتسب على أنها مُباعة.',
      lossPromptYes: 'نعم، تسجيل خسارة',
      lossPromptNo: 'لا، لا شيء',
    },

    charges: {
      category: 'نوع المصروف',
      categoryPlaceholder: 'اختر نوعًا',
      categoryRequired: 'اختر نوع المصروف.',
      date: 'التاريخ',
      amount: 'المبلغ',
      save: 'حفظ المصروف',
      saving: 'جار الحفظ…',
      saved: 'تم حفظ المصروف.',
      recent: 'آخر المصاريف',
      addCategory: '+ نوع مصروف جديد',
      newCategoryName: 'اسم نوع المصروف',
      newCategoryNature: 'ما طبيعة هذا المصروف؟',
      createCategory: 'إضافة',
      nameRequired: 'أدخل اسمًا لنوع المصروف.',
      categoryFailed: 'تعذرت إضافة نوع المصروف.',
      // domain-spec §6.7 — the two meanings of "spent", in plain language.
      nature: {
        operating: 'مصروف المتجر',
        owner_draw: 'مال تأخذه',
      },
      natureHelp: {
        operating: 'مصروف لتشغيل المتجر: إيجار، كهرباء، نقل، أكياس… يُخفض نتيجة المتجر.',
        owner_draw:
          'مال تسحبه لنفسك: مصاريف شخصية، أفراح، عائلة. ليس مصروفًا للمتجر ولا يُخفض نتيجته.',
      },
      deleteTitle: 'حذف هذا المصروف؟',
      deleteBody: 'ستُعاد حسابات تقارير الفترة.',
    },

    losses: {
      intro:
        'ما غادر القسم دون أن يُباع. بدون هذا الإدخال، ستُحتسب هذه المنتجات على أنها مُباعة وتظهر كربح.',
      category: 'القسم',
      categoryPlaceholder: 'اختر قسمًا',
      categoryRequired: 'اختر قسمًا.',
      date: 'التاريخ',
      amount: 'المبلغ بسعر الشراء',
      amountHint: 'ما كلَّفتك هذه المنتجات، لا سعر بيعها.',
      reason: 'ماذا حدث؟',
      // domain-spec §4.2 — the two natures never sum into one number.
      nature: {
        shrinkage: 'خسارة المتجر',
        owner_draw: 'أُخذ لك',
      },
      natureHelp: {
        shrinkage: 'فقد المتجر البضاعة.',
        owner_draw: 'أنت أخذت البضاعة: ليست خسارة للمتجر.',
      },
      reason_: {
        spoiled: 'تالف أو منتهي الصلاحية',
        broken: 'مكسور',
        stolen: 'مسروق',
        given_away: 'أُهدي أو أُعطي',
        family_taken: 'أخذته العائلة',
        personal_use: 'استخدام شخصي',
        other: 'أخرى',
      },
      save: 'حفظ الخسارة',
      saving: 'جار الحفظ…',
      saved: 'تم حفظ الخسارة.',
      recent: 'آخر الخسائر',
      deleteTitle: 'حذف هذه الخسارة؟',
      deleteBody: 'ستُعاد حسابات تقارير الفترة.',
    },

    dashboard: {
      title: 'لوحة المعلومات',
      period: 'الفترة',
      periodClamped: '{{from}} – {{to}} (مقيَّد إلى {{effective}})',
      presets: {
        thisMonth: 'هذا الشهر',
        lastMonth: 'الشهر الماضي',
        thisQuarter: 'هذا الربع',
        thisYear: 'هذه السنة',
        custom: 'فترة أخرى',
      },
      customFrom: 'من',
      customTo: 'إلى',
      customInvalid: 'يجب أن يكون تاريخ النهاية بعد تاريخ البداية.',

      kpiTitle: 'أرقام رئيسية',
      revenue: 'رقم الأعمال',
      grossProfit: 'الهامش الإجمالي',
      operatingCharges: 'مصاريف التشغيل',
      operatingProfit: 'نتيجة التشغيل',
      cashOut: 'المدفوعات',
      cashOutNote: 'مشتريات ومصاريف مدفوعة',
      costIncurred: 'تكلفة الفترة',
      // domain-spec §6.7 — the two are never merged, so the difference has to be
      // explained rather than hidden.
      spentNote:
        'المدفوعات هي ما غادر الصندوق. تكلفة الفترة هي ما استهلكه المتجر فعلًا. الفرق هو المخزون.',
      stockOnHand: 'المخزون في الأقسام',
      // domain-spec §6.8 — the counted value is the figure; the bound is a bound.
      atMost: 'على الأكثر',
      oldestCount: 'أقدم جرد: {{date}}',
      neverCountedShort: 'لم يُجرَّد أي قسم',

      waterfall: {
        title: 'من رقم الأعمال إلى النتيجة',
        caption: 'تسلسل من رقم الأعمال المقدَّر إلى تغير الخزينة.',
        revenue: 'رقم الأعمال المقدَّر',
        goodsSold: 'تكلفة البضاعة المباعة',
        grossProfit: 'الهامش الإجمالي',
        operatingCharges: 'مصاريف التشغيل',
        shrinkage: 'خسائر المتجر',
        operatingProfit: 'نتيجة التشغيل',
        ownerDrawsCash: 'مال أخذه المدير',
        ownerDrawsInKind: 'بضاعة أخذها المدير',
        netCashChange: 'تغير الخزينة',
      },

      stock: {
        title: 'المخزون حسب القسم',
        category: 'القسم',
        lastCount: 'آخر جرد',
        countDate: 'التاريخ',
        freshness: 'القِدَم',
        // domain-spec §6.4 — bought after the last count, fate unknown.
        purchasedSince: 'مشتريات منذ',
        markup: 'الهامش',
        goodsSold: 'بضاعة مباعة',
        grossProfit: 'الهامش الإجمالي',
        never: 'لم يُجرَّد قط',
        days_one: '{{count, number}} ي',
        days_other: '{{count, number}} ي',
        markupValue: '{{pct, number}} %',
        total: 'الإجمالي',
      },

      charges: {
        title: 'المصاريف',
        // domain-spec §6.7 / §5.2 — the separation is the point of the section.
        operating: 'مصاريف المتجر',
        operatingNote: 'تُخفض نتيجة المتجر.',
        ownerDraws: 'مال أخذه المدير',
        ownerDrawsNote: 'ليس مصروفًا للمتجر.',
        subtotal: 'المجموع الفرعي',
        none: 'لا شيء في هذه الفترة.',
        empty: 'لا توجد مصاريف مسجَّلة في هذه الفترة.',
        inKind: 'بضاعة أخذها المدير',
        inKindNote: 'مسجَّلة كخسارة، لا كمصروف: مخصومة بالفعل من المخزون.',
      },

      trend: {
        title: 'التطور على 12 شهرًا',
        note: 'يُحسب كل شهر بنفس طريقة الفترة المعروضة أعلاه.',
        caption: 'الهامش الإجمالي المقدَّر والمدفوعات ومصاريف المتجر، شهرًا بشهر.',
        month: 'الشهر',
        gross_profit_est: 'الهامش الإجمالي',
        cash_out: 'المدفوعات',
        operating_charges: 'مصاريف المتجر',
        inProgress: '(جارٍ)',
      },

      coverage: 'موثوقية الأرقام',
      coverageLevel: {
        good: 'جيدة — الفترة مغطاة بالكامل تقريبًا بالجردات',
        partial: 'جزئية — جزء من الفترة غير مغطى بجرد',
        low: 'ضعيفة — هذه الأرقام تعتمد أساسًا على فترات غير مجرَّدة',
      },
      neverCounted: 'أقسام لم تُجرَّد قط',

      quality: {
        title: 'موثوقية الأرقام',
        coverageValue: '{{pct, number}} % من الفترة مغطى بالجردات.',
        allClear: 'كل شيء على ما يرام: كل قسم مجرَّد وحديث.',
        neverCounted: 'أقسام لم تُجرَّد قط',
        neverCountedItem: '{{category}} — جرِّد هذا القسم ليدخل في النتائج.',
        stale: 'جردات قديمة جدًا',
        staleItem: '{{category}} — آخر جرد منذ {{days, number}} يومًا.',
        unsettled: 'مشتريات غير مسوَّاة',
        unsettledSince: 'مشتريات منذ جرد {{date}} — جرِّد هذا القسم لتسويتها.',
        unsettledNeverCounted: 'مشتريات في قسم لم يُجرَّد قط — جرِّده لتسويتها.',
        anomalies: 'أرقام مستحيلة',
        // domain-spec §6.2 — three kinds, three different causes, three fixes.
        anomaly: {
          negative_outflow: 'المخزون ارتفع أكثر من المشتريات: شراء مفقود أو جرد خاطئ.',
          losses_exceed_outflow:
            'الخسائر المعلنة تتجاوز ما غادر القسم: خسارة مكررة أو بتاريخ خاطئ.',
          no_markup: 'لا هامش محدد لهذا القسم: لا يمكن تقدير أي شيء.',
        },
      },
    },

    placeholder: {
      // Honest placeholders: these routes exist so the shell is navigable, and
      // they say what they are rather than pretending to be under construction.
      settings: 'الإعدادات متاحة في المرحلة السادسة.',
    },

    settings: {
      title: 'الإعدادات',

      general: {
        title: 'المتجر',
        storeName: 'اسم المتجر',
        currencyCode: 'العملة',
        locale: 'اللغة',
        timezone: 'المنطقة الزمنية',
        save: 'حفظ',
        saving: 'جار الحفظ…',
        saved: 'تم حفظ الإعدادات.',
        failed: 'فشل الحفظ.',
      },

      categories: {
        title: 'الأقسام',
        name: 'الاسم',
        description: 'المحتوى (مرجع)',
        descriptionHint: 'مثال: حليب، جبن، زبادي، زبدة',
        edit: 'تعديل',
        save: 'حفظ',
        saving: 'جار الحفظ…',
        cancel: 'إلغاء',
        deactivate: 'تعطيل',
        activate: 'تفعيل',
        inactive: 'معطَّل',
        add: 'إضافة قسم',
        addTitle: 'قسم جديد',
        nameRequired: 'أدخل اسمًا لهذا القسم.',
        failed: 'فشل الحفظ.',
      },

      markups: {
        title: 'الهوامش',
        pctLabel: 'الهامش (%)',
        // domain-spec §1.3: markup-on-cost convention, with a live worked example.
        convention:
          'هامش على سعر الشراء. لهامش {{pct, number}} %: اشترِ بـ 100، البيع المقدَّر {{sell, number}}.',
        // Changing a rate does NOT affect past reports (080_markup.sql proves it);
        // the note is about the effective date only.
        effectiveNote: 'يسري هذا التغيير من اليوم. التقارير السابقة غير متأثرة.',
        save: 'حفظ الهامش',
        saving: 'جار الحفظ…',
        saved: 'تم حفظ الهامش.',
        failed: 'فشل الحفظ.',
        historyTitle: 'السجل',
        effectiveFrom: 'منذ {{date}}',
        noRate: 'لا هامش محدد.',
        notANumber: 'هذه القيمة ليست رقمًا.',
        negative: 'لا يمكن أن يكون الهامش سالبًا.',
        tooPrecise: 'خانتان عشريتان كحد أقصى.',
      },

      chargeCategories: {
        title: 'أنواع المصاريف',
        edit: 'تعديل',
        save: 'حفظ',
        saving: 'جار الحفظ…',
        cancel: 'إلغاء',
        deactivate: 'تعطيل',
        activate: 'تفعيل',
        inactive: 'معطَّل',
        system: '(نوع النظام)',
        add: 'إضافة نوع',
        addTitle: 'نوع مصروف جديد',
        nameRequired: 'أدخل اسمًا.',
        failed: 'فشل الحفظ.',
      },
    },

    error: {
      title: 'حدث خطأ',
      retry: 'إعادة المحاولة',
      reportUnreadable:
        'الأرقام المستلمة من الخادم ليست بالصيغة المتوقعة. لا تُعرض لأن رقمًا خاطئًا أسوأ من غياب الرقم.',
    },
  },
} as const
