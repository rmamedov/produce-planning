import { addHours, startOfHour } from "date-fns";

export function createMockData(now = new Date()) {
  const baseHour = startOfHour(now);

  return {
    settings: {
      companyName: "Produce Planning Demo",
      planningHorizonHours: 4,
      generationIntervalMinutes: 15,
      kitchenBoardRefreshSec: 30
    },
    branches: [
      {
        slug: "podil",
        name: "Київ Поділ",
        address: "вул. Сагайдачного, 13"
      },
      {
        slug: "lviv-center",
        name: "Львів Центр",
        address: "пл. Ринок, 18"
      },
      {
        slug: "dnipro-river",
        name: "Дніпро Набережна",
        address: "вул. Січеславська Набережна, 31"
      }
    ],
    techCards: [
      {
        slug: "olivier",
        name: "Салат Олів'є",
        typicalCookingTimeMinutes: 40,
        ingredients: [
          { ingredientName: "Картопля", quantity: 2, unit: "кг" },
          { ingredientName: "Ковбаса", quantity: 1.2, unit: "кг" },
          { ingredientName: "Горошок", quantity: 0.8, unit: "кг" }
        ],
        steps: [
          { stepNumber: 1, description: "Підготувати інгредієнти та охолодити відварені овочі." },
          { stepNumber: 2, description: "Нарізати продукти та змішати з майонезом." },
          { stepNumber: 3, description: "Розфасувати по порціях і відправити на охолодження." }
        ],
        requiredEquipment: ["Стіл підготовки", "Ніж", "Холодильна шафа"]
      },
      {
        slug: "greek-salad",
        name: "Салат Грецький",
        typicalCookingTimeMinutes: 20,
        ingredients: [
          { ingredientName: "Томати", quantity: 1.4, unit: "кг" },
          { ingredientName: "Сир фета", quantity: 0.5, unit: "кг" },
          { ingredientName: "Огірок", quantity: 1.2, unit: "кг" }
        ],
        steps: [
          { stepNumber: 1, description: "Нарізати свіжі овочі великими кубиками." },
          { stepNumber: 2, description: "Додати сир, маслини та заправку." }
        ],
        requiredEquipment: ["Гастроємність", "Ніж", "Ваги"]
      },
      {
        slug: "syrnyky",
        name: "Сирники",
        typicalCookingTimeMinutes: 25,
        ingredients: [
          { ingredientName: "Сир кисломолочний", quantity: 2.5, unit: "кг" },
          { ingredientName: "Борошно", quantity: 0.6, unit: "кг" },
          { ingredientName: "Яйце", quantity: 20, unit: "шт" }
        ],
        steps: [
          { stepNumber: 1, description: "Замісити тісто та сформувати сирники." },
          { stepNumber: 2, description: "Обсмажити до золотистої скоринки." },
          { stepNumber: 3, description: "Остудити та упакувати." }
        ],
        requiredEquipment: ["Плита", "Сковорода", "Лопатка"]
      },
      {
        slug: "pancakes",
        name: "Млинці з куркою",
        typicalCookingTimeMinutes: 35,
        ingredients: [
          { ingredientName: "Млинці", quantity: 30, unit: "шт" },
          { ingredientName: "Курка", quantity: 1.5, unit: "кг" },
          { ingredientName: "Соус вершковий", quantity: 0.9, unit: "л" }
        ],
        steps: [
          { stepNumber: 1, description: "Підготувати начинку та начинити млинці." },
          { stepNumber: 2, description: "Запекти або доготувати на пароконвектоматі." }
        ],
        requiredEquipment: ["Пароконвектомат", "Дошка", "Ніж"]
      }
    ],
    products: [
      { slug: "olivier", name: "Салат Олів'є", unitWeight: 250, techCardSlug: "olivier", photoUrl: null },
      { slug: "greek-salad", name: "Салат Грецький", unitWeight: 220, techCardSlug: "greek-salad", photoUrl: null },
      { slug: "syrnyky", name: "Сирники", unitWeight: 180, techCardSlug: "syrnyky", photoUrl: null },
      { slug: "pancakes", name: "Млинці з куркою", unitWeight: 240, techCardSlug: "pancakes", photoUrl: null }
    ],
    assortments: [
      {
        branchSlug: "podil",
        items: [
          { productSlug: "olivier", currentStock: 0, hourlyTargetStock: 4 },
          { productSlug: "greek-salad", currentStock: 3, hourlyTargetStock: 4 },
          { productSlug: "syrnyky", currentStock: 5, hourlyTargetStock: 3 },
          { productSlug: "pancakes", currentStock: 2, hourlyTargetStock: 3 }
        ]
      },
      {
        branchSlug: "lviv-center",
        items: [
          { productSlug: "olivier", currentStock: 2, hourlyTargetStock: 3 },
          { productSlug: "greek-salad", currentStock: 1, hourlyTargetStock: 3 },
          { productSlug: "syrnyky", currentStock: 4, hourlyTargetStock: 3 }
        ]
      },
      {
        branchSlug: "dnipro-river",
        items: [
          { productSlug: "olivier", currentStock: 4, hourlyTargetStock: 4 },
          { productSlug: "syrnyky", currentStock: 1, hourlyTargetStock: 4 },
          { productSlug: "pancakes", currentStock: 0, hourlyTargetStock: 2 }
        ]
      }
    ],
    forecasts: [
      { branchSlug: "podil", productSlug: "olivier", values: [2, 2, 3, 1] },
      { branchSlug: "podil", productSlug: "greek-salad", values: [1, 1, 2, 1] },
      { branchSlug: "podil", productSlug: "syrnyky", values: [1, 2, 2, 1] },
      { branchSlug: "podil", productSlug: "pancakes", values: [1, 1, 1, 2] },
      { branchSlug: "lviv-center", productSlug: "olivier", values: [1, 2, 2, 1] },
      { branchSlug: "lviv-center", productSlug: "greek-salad", values: [2, 2, 1, 1] },
      { branchSlug: "lviv-center", productSlug: "syrnyky", values: [1, 1, 2, 1] },
      { branchSlug: "dnipro-river", productSlug: "olivier", values: [1, 1, 1, 2] },
      { branchSlug: "dnipro-river", productSlug: "syrnyky", values: [2, 1, 1, 2] },
      { branchSlug: "dnipro-river", productSlug: "pancakes", values: [1, 2, 1, 1] }
    ].flatMap((entry) =>
      entry.values.map((forecastedSalesQty, index) => ({
        branchSlug: entry.branchSlug,
        productSlug: entry.productSlug,
        hour: addHours(baseHour, index),
        forecastedSalesQty
      }))
    )
  };
}
