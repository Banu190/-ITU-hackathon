import type { Dataset } from "./api";

// Оценки и кейсы для демонстрационных переводов из data/demo.csv.
export default {
  "dataset_id": 0,
  "source": "Демонстрационный набор",
  "transactions": [
    {
      "transaction_id": "TX-2034",
      "timestamp": "2026-11-18T07:10:00Z",
      "sender": "ACC-1024",
      "receiver": "ACC-5021",
      "amount_tiyn": 2200000,
      "risk_score": 15,
      "risk_level": "low",
      "reasons": [
        {
          "code": "new_recipient",
          "title": "Новый получатель",
          "description": "Первая операция по этой паре счетов в загруженном наборе.",
          "points": 15,
          "related_transactions": []
        }
      ]
    },
    {
      "transaction_id": "TX-2035",
      "timestamp": "2026-11-18T10:10:00Z",
      "sender": "ACC-1024",
      "receiver": "ACC-5021",
      "amount_tiyn": 1850000,
      "risk_score": 0,
      "risk_level": "low",
      "reasons": []
    },
    {
      "transaction_id": "TX-2036",
      "timestamp": "2026-11-18T13:10:00Z",
      "sender": "ACC-1024",
      "receiver": "ACC-5021",
      "amount_tiyn": 3100000,
      "risk_score": 0,
      "risk_level": "low",
      "reasons": []
    },
    {
      "transaction_id": "TX-2041",
      "timestamp": "2026-11-19T04:12:00Z",
      "sender": "ACC-1024",
      "receiver": "ACC-2081",
      "amount_tiyn": 85000000,
      "risk_score": 100,
      "risk_level": "high",
      "reasons": [
        {
          "code": "new_recipient",
          "title": "Новый получатель",
          "description": "Первая операция по этой паре счетов в загруженном наборе.",
          "points": 15,
          "related_transactions": []
        },
        {
          "code": "unusual_amount",
          "title": "Нетипичная сумма",
          "description": "Сумма от 100 000 ₸, минимум втрое выше медианы 3–10 предыдущих исходящих операций.",
          "points": 35,
          "related_transactions": [
            "TX-2034",
            "TX-2035",
            "TX-2036"
          ]
        },
        {
          "code": "chain",
          "title": "Быстрая цепочка",
          "description": "Исходящий перевод с промежуточного счёта в течение 15 минут, на сумму не больше входящей.",
          "points": 50,
          "related_transactions": [
            "TX-2042"
          ]
        }
      ]
    },
    {
      "transaction_id": "TX-2042",
      "timestamp": "2026-11-19T04:15:00Z",
      "sender": "ACC-2081",
      "receiver": "ACC-3092",
      "amount_tiyn": 42000000,
      "risk_score": 65,
      "risk_level": "medium",
      "reasons": [
        {
          "code": "new_recipient",
          "title": "Новый получатель",
          "description": "Первая операция по этой паре счетов в загруженном наборе.",
          "points": 15,
          "related_transactions": []
        },
        {
          "code": "chain",
          "title": "Быстрая цепочка",
          "description": "Исходящий перевод с промежуточного счёта в течение 15 минут, на сумму не больше входящей.",
          "points": 50,
          "related_transactions": [
            "TX-2041",
            "TX-2043"
          ]
        }
      ]
    },
    {
      "transaction_id": "TX-2043",
      "timestamp": "2026-11-19T04:18:00Z",
      "sender": "ACC-3092",
      "receiver": "ACC-4015",
      "amount_tiyn": 31000000,
      "risk_score": 65,
      "risk_level": "medium",
      "reasons": [
        {
          "code": "new_recipient",
          "title": "Новый получатель",
          "description": "Первая операция по этой паре счетов в загруженном наборе.",
          "points": 15,
          "related_transactions": []
        },
        {
          "code": "chain",
          "title": "Быстрая цепочка",
          "description": "Исходящий перевод с промежуточного счёта в течение 15 минут, на сумму не больше входящей.",
          "points": 50,
          "related_transactions": [
            "TX-2042"
          ]
        }
      ]
    },
    {
      "transaction_id": "TX-2044",
      "timestamp": "2026-11-19T04:46:00Z",
      "sender": "ACC-6110",
      "receiver": "ACC-6180",
      "amount_tiyn": 7400000,
      "risk_score": 80,
      "risk_level": "high",
      "reasons": [
        {
          "code": "new_recipient",
          "title": "Новый получатель",
          "description": "Первая операция по этой паре счетов в загруженном наборе.",
          "points": 15,
          "related_transactions": []
        },
        {
          "code": "frequency",
          "title": "Частые переводы",
          "description": "Три исходящих перевода с одного счёта за 10 минут.",
          "points": 25,
          "related_transactions": [
            "TX-2045"
          ]
        },
        {
          "code": "splitting",
          "title": "Дробление суммы",
          "description": "За 10 минут на один счёт ушли не менее трёх переводов меньше 100 000 ₸ каждый, всего от 200 000 ₸.",
          "points": 40,
          "related_transactions": [
            "TX-2045"
          ]
        }
      ]
    },
    {
      "transaction_id": "TX-2045",
      "timestamp": "2026-11-19T04:49:00Z",
      "sender": "ACC-6110",
      "receiver": "ACC-6180",
      "amount_tiyn": 7200000,
      "risk_score": 65,
      "risk_level": "medium",
      "reasons": [
        {
          "code": "frequency",
          "title": "Частые переводы",
          "description": "Три исходящих перевода с одного счёта за 10 минут.",
          "points": 25,
          "related_transactions": [
            "TX-2044",
            "TX-2046"
          ]
        },
        {
          "code": "splitting",
          "title": "Дробление суммы",
          "description": "За 10 минут на один счёт ушли не менее трёх переводов меньше 100 000 ₸ каждый, всего от 200 000 ₸.",
          "points": 40,
          "related_transactions": [
            "TX-2044",
            "TX-2046"
          ]
        }
      ]
    },
    {
      "transaction_id": "TX-2046",
      "timestamp": "2026-11-19T04:52:00Z",
      "sender": "ACC-6110",
      "receiver": "ACC-6180",
      "amount_tiyn": 7650000,
      "risk_score": 65,
      "risk_level": "medium",
      "reasons": [
        {
          "code": "frequency",
          "title": "Частые переводы",
          "description": "Три исходящих перевода с одного счёта за 10 минут.",
          "points": 25,
          "related_transactions": [
            "TX-2045"
          ]
        },
        {
          "code": "splitting",
          "title": "Дробление суммы",
          "description": "За 10 минут на один счёт ушли не менее трёх переводов меньше 100 000 ₸ каждый, всего от 200 000 ₸.",
          "points": 40,
          "related_transactions": [
            "TX-2045"
          ]
        }
      ]
    },
    {
      "transaction_id": "TX-2047",
      "timestamp": "2026-11-19T05:10:00Z",
      "sender": "ACC-7350",
      "receiver": "ACC-7440",
      "amount_tiyn": 12500000,
      "risk_score": 15,
      "risk_level": "low",
      "reasons": [
        {
          "code": "new_recipient",
          "title": "Новый получатель",
          "description": "Первая операция по этой паре счетов в загруженном наборе.",
          "points": 15,
          "related_transactions": []
        }
      ]
    },
    {
      "transaction_id": "TX-2048",
      "timestamp": "2026-11-19T05:50:00Z",
      "sender": "ACC-8100",
      "receiver": "ACC-8280",
      "amount_tiyn": 450050,
      "risk_score": 15,
      "risk_level": "low",
      "reasons": [
        {
          "code": "new_recipient",
          "title": "Новый получатель",
          "description": "Первая операция по этой паре счетов в загруженном наборе.",
          "points": 15,
          "related_transactions": []
        }
      ]
    }
  ],
  "cases": [
    {
      "case_id": "FR-001",
      "risk_score": 100,
      "risk_level": "high",
      "suspicious_transactions": [
        "TX-2041",
        "TX-2042",
        "TX-2043"
      ],
      "transaction_ids": [
        "TX-2034",
        "TX-2035",
        "TX-2036",
        "TX-2041",
        "TX-2042",
        "TX-2043"
      ],
      "reasons": [
        "Новый получатель",
        "Нетипичная сумма",
        "Быстрая цепочка"
      ]
    },
    {
      "case_id": "FR-002",
      "risk_score": 80,
      "risk_level": "high",
      "suspicious_transactions": [
        "TX-2044",
        "TX-2045",
        "TX-2046"
      ],
      "transaction_ids": [
        "TX-2044",
        "TX-2045",
        "TX-2046"
      ],
      "reasons": [
        "Новый получатель",
        "Частые переводы",
        "Дробление суммы"
      ]
    }
  ]
} satisfies Dataset;
