/*
 * French copy. `fr` is the only bundled language in v1.0 (plan §1.2, Q4);
 * `ar`/`en` are additive later, which is why every string lives here rather
 * than inline in a component.
 *
 * The wording of `money.modelled*` and `onboarding.*` is not free text — it is
 * specified in domain-spec §7.2 and §3.5 respectively, and it is what keeps an
 * estimate from being read as a measurement.
 */
export const fr = {
  translation: {
    app: {
      name: 'Aziz ERP',
      loading: 'Chargement…',
    },

    money: {
      // domain-spec §7.2 — the tooltip on every modelled figure.
      modelledHint:
        'Estimation, calculée à partir de la marge configurée. Ce n’est pas une mesure.',
      modelledHintWithMarkup: 'Estimation, calculée à partir d’une marge de {{markup, number}} %.',
      modelledLabel: 'Estimation',
      measuredLabel: 'Montant constaté',
    },

    login: {
      title: 'Connexion',
      subtitle: 'Cet espace est réservé au gérant du magasin.',
      email: 'Adresse e-mail',
      password: 'Mot de passe',
      submit: 'Se connecter',
      submitting: 'Connexion…',
      // Deliberately does not say which of the two was wrong.
      failed: 'Adresse e-mail ou mot de passe incorrect.',
      offline: 'Connexion au serveur impossible. Vérifiez votre connexion internet.',
      noAccess: 'Ce compte n’a pas accès à ce magasin. Contactez le gérant pour qu’il vous ajoute.',
    },

    nav: {
      dashboard: 'Tableau de bord',
      purchases: 'Achats',
      charges: 'Charges',
      counts: 'Inventaire',
      losses: 'Pertes',
      settings: 'Réglages',
      signOut: 'Se déconnecter',
    },

    onboarding: {
      title: 'Ouverture des comptes',
      // domain-spec §3.5 — why the user is being asked this before anything else.
      intro:
        'Avant de commencer, il faut savoir ce qu’il y a aujourd’hui dans le magasin. Pour chaque rayon, indiquez la valeur du stock au prix d’achat — ce que vous l’avez payé, pas ce que vous le vendez.',
      wholeShelf: 'Tout le rayon, pas seulement un produit.',
      dateLabel: 'Date du comptage',
      skipCategory: 'Je ne vends pas ce rayon',
      skipped: 'Rayon désactivé',
      undoSkip: 'Rétablir',
      submit: 'Ouvrir les comptes',
      submitting: 'Enregistrement…',
      incomplete: 'Renseignez chaque rayon, ou désactivez ceux que vous ne vendez pas.',
      failed: 'L’enregistrement a échoué. Rien n’a été enregistré — vous pouvez réessayer.',
      total: 'Valeur totale du stock',
    },

    common: {
      next: 'Suivant',
      back: 'Retour',
      cancel: 'Annuler',
      delete: 'Supprimer',
      edit: 'Modifier',
      saveChanges: 'Enregistrer les modifications',
      // Shown while a record is loaded into the form. Without it the screen is
      // indistinguishable from a fresh entry that happens to be prefilled, and
      // the owner saves what they believe is a new record.
      editing: 'Vous modifiez un enregistrement existant.',
      noteOptional: 'Note (facultatif)',
      unknownAmount: 'montant à saisir',
    },

    date: {
      today: 'Aujourd’hui',
      yesterday: 'Hier',
    },

    amount: {
      error: {
        empty: 'Indiquez un montant.',
        not_a_number: 'Ce montant n’est pas un nombre. Exemple : 1 250,00',
        negative: 'Le montant ne peut pas être négatif.',
        not_positive: 'Le montant doit être supérieur à zéro.',
        // domain-spec §9.1: money is numeric(14,2). A third decimal would be
        // rounded away by the database without telling anyone.
        too_precise: 'Deux décimales au maximum.',
      },
    },

    recent: {
      empty: 'Rien d’enregistré pour l’instant.',
    },

    write: {
      error: {
        future: 'Cette date est dans le futur. Vous pouvez saisir une date passée, pas à venir.',
        duplicateCount: 'Un inventaire existe déjà pour ce rayon à cette date.',
        countRequired:
          'Cet achat est le dernier événement de ce rayon : le comptage du rayon est obligatoire.',
        countOnBackdated:
          'Cet achat est antérieur au dernier inventaire de ce rayon : aucun comptage ne peut y être joint.',
        notAuthorised: 'Ce compte n’a pas accès à ce magasin.',
        offline: 'Serveur injoignable. Rien n’a été enregistré — réessayez.',
        // The one thing the user must be sure of, whatever went wrong.
        unknown: 'L’enregistrement a échoué. Rien n’a été enregistré — vous pouvez réessayer.',
      },
    },

    purchases: {
      category: 'Rayon',
      categoryPlaceholder: 'Choisir un rayon',
      categoryRequired: 'Choisissez un rayon.',
      date: 'Date de l’achat',
      amount: 'Montant payé',
      amountHint: 'Ce que vous avez payé au fournisseur, pas le prix de vente.',
      // domain-spec §3.2A — this wording is binding, not editorial.
      wholeShelf: 'Tout le rayon {{category}}',
      notOnlyWhatYouBought: 'Pas seulement ce que vous venez d’acheter.',
      howMuchWasLeft: 'Combien restait-il, au prix d’achat ?',
      shelfWasEmpty: 'Rien, le rayon était vide',
      somethingWasLeft: 'Il restait quelque chose',
      priorStockLabel: 'Valeur restante, au prix d’achat',
      expectedPrefix: 'D’après vos enregistrements, ce rayon devrait contenir environ',
      // domain-spec §3.2, backdating exception.
      backdated:
        'Cet achat est antérieur au dernier inventaire de ce rayon ({{date}}) ; aucun comptage ne sera enregistré.',
      save: 'Enregistrer l’achat',
      saving: 'Enregistrement…',
      saved: 'Achat enregistré.',
      // The idempotency cache answered instead of a second write (plan §2.12).
      savedReplayed: 'Cet achat était déjà enregistré. Rien n’a été ajouté une deuxième fois.',
      recent: 'Derniers achats',
      noCountAttached: 'sans comptage',
      deleteTitle: 'Supprimer cet achat ?',
      deleteBody:
        'Le comptage enregistré avec cet achat sera supprimé également. Les rapports seront recalculés.',
    },

    plausibility: {
      title: 'Ce chiffre semble inhabituel',
      entered: 'Vous avez saisi',
      butExpected: ', mais {{category}} devrait contenir environ',
      verdict: {
        exceeds_bound:
          'C’est plus que ce que le rayon peut contenir d’après vos enregistrements : un achat manque peut-être, ou le montant est erroné.',
        high_outflow:
          'C’est une baisse inhabituellement forte pour le nombre de jours écoulés depuis le dernier comptage.',
        suspicious_drop:
          'C’est beaucoup plus bas que prévu, alors que le dernier comptage est très récent.',
        ok: '',
      },
      heuristic: 'Ce n’est qu’un contrôle indicatif : si votre chiffre est juste, enregistrez-le.',
      fix: 'Corriger',
      saveAnyway: 'Enregistrer quand même',
    },

    counts: {
      mode: 'Mode de saisie',
      modeSingle: 'Un rayon',
      modeSweep: 'Tous les rayons',
      category: 'Rayon',
      categoryPlaceholder: 'Choisir un rayon',
      categoryRequired: 'Choisissez un rayon.',
      date: 'Date du comptage',
      valueLabel: 'Valeur au prix d’achat',
      wholeShelfHint: 'Tout le rayon, au prix d’achat — pas seulement un produit.',
      previous: 'Dernier comptage ({{date}}) :',
      neverCounted: 'Ce rayon n’a jamais été compté.',
      total: 'Valeur totale du stock',
      sweepIntro:
        'Comptage de fin de mois : renseignez chaque rayon, tout est enregistré en une seule fois.',
      sweepIncomplete: 'Renseignez chaque rayon avant d’enregistrer.',
      save: 'Enregistrer le comptage',
      saveSweep: 'Enregistrer tous les comptages',
      saving: 'Enregistrement…',
      saved: 'Comptage enregistré.',
      sweepSaved: '{{n}} comptages enregistrés.',
      savedReplayed: 'Ce comptage était déjà enregistré. Rien n’a été ajouté une deuxième fois.',
      recent: 'Derniers comptages',
      source: {
        standalone: 'comptage',
        purchase: 'avec un achat',
      },
      deleteTitle: 'Supprimer ce comptage ?',
      deleteBody:
        'La période couverte par ce comptage sera recalculée à partir du comptage précédent.',
      // domain-spec §4.3 — asked at the shelf, skippable in one tap.
      lossPromptTitle: 'Quelque chose s’est-il perdu ?',
      lossPromptBody:
        'Depuis le dernier comptage, y a-t-il eu des produits abîmés, cassés, volés ou pris pour la maison ? Sans cette information, ils sont comptés comme vendus.',
      lossPromptYes: 'Oui, déclarer une perte',
      lossPromptNo: 'Non, rien',
    },

    charges: {
      category: 'Type de dépense',
      categoryPlaceholder: 'Choisir un type',
      categoryRequired: 'Choisissez un type de dépense.',
      date: 'Date',
      amount: 'Montant',
      save: 'Enregistrer la dépense',
      saving: 'Enregistrement…',
      saved: 'Dépense enregistrée.',
      recent: 'Dernières dépenses',
      addCategory: '+ Nouveau type de dépense',
      newCategoryName: 'Nom du type de dépense',
      newCategoryNature: 'De quoi s’agit-il ?',
      createCategory: 'Ajouter',
      nameRequired: 'Donnez un nom à ce type de dépense.',
      categoryFailed: 'Impossible d’ajouter ce type de dépense.',
      // domain-spec §6.7 — the two meanings of "spent", in plain language.
      nature: {
        operating: 'Dépense du magasin',
        owner_draw: 'Argent que vous prenez',
      },
      natureHelp: {
        operating:
          'Une dépense pour faire tourner le magasin : loyer, électricité, transport, sacs… Elle réduit le résultat du magasin.',
        owner_draw:
          'De l’argent que vous sortez pour vous : dépenses personnelles, fêtes, famille. Ce n’est pas une dépense du magasin et cela ne réduit pas son résultat.',
      },
      deleteTitle: 'Supprimer cette dépense ?',
      deleteBody: 'Les rapports de la période seront recalculés.',
    },

    losses: {
      intro:
        'Ce qui a quitté le rayon sans être vendu. Sans cette saisie, ces produits sont comptés comme vendus, et apparaissent en bénéfice.',
      category: 'Rayon',
      categoryPlaceholder: 'Choisir un rayon',
      categoryRequired: 'Choisissez un rayon.',
      date: 'Date',
      amount: 'Montant au prix d’achat',
      amountHint: 'Ce que ces produits vous ont coûté, pas leur prix de vente.',
      reason: 'Que s’est-il passé ?',
      // domain-spec §4.2 — the two natures never sum into one number.
      nature: {
        shrinkage: 'Perte du magasin',
        owner_draw: 'Pris pour vous',
      },
      natureHelp: {
        shrinkage: 'Le magasin a perdu la marchandise.',
        owner_draw: 'Vous avez pris la marchandise : ce n’est pas une perte du magasin.',
      },
      reason_: {
        spoiled: 'Abîmé ou périmé',
        broken: 'Cassé',
        stolen: 'Volé',
        given_away: 'Offert ou donné',
        family_taken: 'Pris par la famille',
        personal_use: 'Consommation personnelle',
        other: 'Autre',
      },
      save: 'Enregistrer la perte',
      saving: 'Enregistrement…',
      saved: 'Perte enregistrée.',
      recent: 'Dernières pertes',
      deleteTitle: 'Supprimer cette perte ?',
      deleteBody: 'Les rapports de la période seront recalculés.',
    },

    dashboard: {
      title: 'Tableau de bord',
      period: 'Période',
      periodClamped: '{{from}} – {{to}} (arrêté au {{effective}})',
      presets: {
        thisMonth: 'Ce mois-ci',
        lastMonth: 'Le mois dernier',
        thisQuarter: 'Ce trimestre',
        thisYear: 'Cette année',
        custom: 'Autre période',
      },
      customFrom: 'Du',
      customTo: 'Au',
      customInvalid: 'La date de fin doit être postérieure à la date de début.',

      kpiTitle: 'Chiffres clés',
      revenue: 'Chiffre d’affaires',
      grossProfit: 'Marge brute',
      operatingCharges: 'Charges d’exploitation',
      operatingProfit: 'Résultat d’exploitation',
      cashOut: 'Sorties d’argent',
      cashOutNote: 'Achats et dépenses payés',
      costIncurred: 'Coût de la période',
      // domain-spec §6.7 — the two are never merged, so the difference has to be
      // explained rather than hidden.
      spentNote:
        'Les sorties d’argent, c’est ce qui a quitté la caisse. Le coût de la période, c’est ce que le magasin a réellement consommé. La différence, c’est le stock.',
      stockOnHand: 'Stock en rayon',
      // domain-spec §6.8 — the counted value is the figure; the bound is a bound.
      atMost: 'au plus',
      oldestCount: 'Comptage le plus ancien : {{date}}',
      neverCountedShort: 'Aucun rayon compté',

      waterfall: {
        title: 'Du chiffre d’affaires au résultat',
        caption: 'Enchaînement du chiffre d’affaires estimé jusqu’à la variation de trésorerie.',
        revenue: 'Chiffre d’affaires estimé',
        goodsSold: 'Coût des marchandises vendues',
        grossProfit: 'Marge brute',
        operatingCharges: 'Charges d’exploitation',
        shrinkage: 'Pertes du magasin',
        operatingProfit: 'Résultat d’exploitation',
        ownerDrawsCash: 'Argent pris par le gérant',
        ownerDrawsInKind: 'Marchandise prise par le gérant',
        netCashChange: 'Variation de trésorerie',
      },

      stock: {
        title: 'Stock par rayon',
        category: 'Rayon',
        lastCount: 'Dernier comptage',
        countDate: 'Date',
        freshness: 'Ancienneté',
        // domain-spec §6.4 — bought after the last count, fate unknown.
        purchasedSince: 'Acheté depuis',
        markup: 'Marge',
        goodsSold: 'Marchandises vendues',
        grossProfit: 'Marge brute',
        never: 'jamais compté',
        days_one: '{{count, number}} j',
        days_other: '{{count, number}} j',
        markupValue: '{{pct, number}} %',
        total: 'Total',
      },

      charges: {
        title: 'Dépenses',
        // domain-spec §6.7 / §5.2 — the separation is the point of the section.
        operating: 'Dépenses du magasin',
        operatingNote: 'Elles réduisent le résultat du magasin.',
        ownerDraws: 'Argent pris par le gérant',
        ownerDrawsNote: 'Ce n’est pas une dépense du magasin.',
        subtotal: 'Sous-total',
        none: 'Rien sur la période.',
        empty: 'Aucune dépense enregistrée sur la période.',
        inKind: 'Marchandise prise par le gérant',
        inKindNote:
          'Enregistrée comme une perte, pas comme une dépense : elle est déjà déduite du stock.',
      },

      trend: {
        title: 'Évolution sur 12 mois',
        note: 'Chaque mois est calculé exactement comme la période affichée ci-dessus.',
        caption: 'Marge brute estimée, sorties d’argent et dépenses du magasin, mois par mois.',
        month: 'Mois',
        gross_profit_est: 'Marge brute',
        cash_out: 'Sorties d’argent',
        operating_charges: 'Dépenses du magasin',
        inProgress: '(en cours)',
      },

      coverage: 'Fiabilité des chiffres',
      coverageLevel: {
        good: 'Bonne — la période est presque entièrement couverte par des comptages',
        partial: 'Partielle — une partie de la période n’est pas couverte par un comptage',
        low: 'Faible — ces chiffres reposent surtout sur des périodes non comptées',
      },
      neverCounted: 'Rayons jamais comptés',

      quality: {
        title: 'Fiabilité des chiffres',
        coverageValue: '{{pct, number}} % de la période est couverte par des comptages.',
        allClear: 'Rien à signaler : chaque rayon est compté et à jour.',
        neverCounted: 'Rayons jamais comptés',
        neverCountedItem: '{{category}} — comptez ce rayon pour qu’il entre dans les résultats.',
        stale: 'Comptages trop anciens',
        staleItem: '{{category}} — dernier comptage il y a {{days, number}} jours.',
        unsettled: 'Achats non encore soldés',
        unsettledSince:
          'achetés depuis le comptage du {{date}} — comptez ce rayon pour les solder.',
        unsettledNeverCounted: 'achetés, sur un rayon jamais compté — comptez-le pour les solder.',
        anomalies: 'Chiffres impossibles',
        // domain-spec §6.2 — three kinds, three different causes, three fixes.
        anomaly: {
          negative_outflow:
            'le stock a augmenté plus que les achats : un achat manque, ou un comptage est erroné.',
          losses_exceed_outflow:
            'les pertes déclarées dépassent ce qui a quitté le rayon : une perte est en double, ou mal datée.',
          no_markup: 'aucune marge n’est configurée pour ce rayon : rien ne peut être estimé.',
        },
      },
    },

    placeholder: {
      // Honest placeholders: these routes exist so the shell is navigable, and
      // they say what they are rather than pretending to be under construction.
      settings: 'Les réglages arrivent en phase 6.',
    },

    settings: {
      title: 'Réglages',

      general: {
        title: 'Magasin',
        storeName: 'Nom du magasin',
        currencyCode: 'Devise',
        locale: 'Langue',
        timezone: 'Fuseau horaire',
        save: 'Enregistrer',
        saving: 'Enregistrement…',
        saved: 'Réglages enregistrés.',
        failed: 'L’enregistrement a échoué.',
      },

      categories: {
        title: 'Rayons',
        name: 'Nom',
        description: 'Contenu (aide-mémoire)',
        descriptionHint: 'Ex. : lait, fromage, yaourt, beurre',
        edit: 'Modifier',
        save: 'Enregistrer',
        saving: 'Enregistrement…',
        cancel: 'Annuler',
        deactivate: 'Désactiver',
        activate: 'Réactiver',
        inactive: 'Désactivé',
        add: 'Ajouter un rayon',
        addTitle: 'Nouveau rayon',
        nameRequired: 'Donnez un nom à ce rayon.',
        failed: 'L’enregistrement a échoué.',
      },

      markups: {
        title: 'Marges',
        pctLabel: 'Marge (%)',
        // domain-spec §1.3: markup-on-cost convention, with a live worked example.
        convention:
          'Marge sur le prix d’achat. Pour une marge de {{pct, number}} % : achetez à 100, vendez estimé à {{sell, number}}.',
        // Changing a rate does NOT affect past reports (080_markup.sql proves it);
        // the note is about the effective date only.
        effectiveNote:
          'Ce changement s’applique à partir d’aujourd’hui. Les rapports passés ne sont pas affectés.',
        save: 'Enregistrer la marge',
        saving: 'Enregistrement…',
        saved: 'Marge enregistrée.',
        failed: 'L’enregistrement a échoué.',
        historyTitle: 'Historique',
        effectiveFrom: 'depuis le {{date}}',
        noRate: 'Aucune marge définie.',
        notANumber: 'Cette valeur n’est pas un nombre.',
        negative: 'La marge ne peut pas être négative.',
        tooPrecise: 'Deux décimales au maximum.',
      },

      chargeCategories: {
        title: 'Types de dépenses',
        edit: 'Modifier',
        save: 'Enregistrer',
        saving: 'Enregistrement…',
        cancel: 'Annuler',
        deactivate: 'Désactiver',
        activate: 'Réactiver',
        inactive: 'Désactivé',
        system: '(type système)',
        add: 'Ajouter un type',
        addTitle: 'Nouveau type de dépense',
        nameRequired: 'Donnez un nom.',
        failed: 'L’enregistrement a échoué.',
      },
    },

    error: {
      title: 'Une erreur est survenue',
      retry: 'Réessayer',
      reportUnreadable:
        'Les chiffres reçus du serveur n’ont pas le format attendu. Ils ne sont pas affichés, car un chiffre faux est pire qu’une absence de chiffre.',
    },
  },
} as const
