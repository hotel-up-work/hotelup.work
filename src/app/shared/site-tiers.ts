export interface SiteTier {
	name: string;
	price: string;
	tagline: string;
	/** Name of the previous tier this one builds on; renders as the first line of the list. */
	inherits?: string;
	features: string[];
	recommended?: boolean;
}

export const SITE_TIERS: SiteTier[] = [
	{
		name: 'Базовий',
		price: '$200',
		tagline: 'Швидкий старт: сайт на готовому дизайні',
		features: [
			'Готовий дизайн',
			'Ваші фото та тексти',
			'SEO-налаштування сайту',
			'Мобільна версія',
			'Система бронювання: заявки надходять у Hotel Upwork',
		],
	},
	{
		name: 'Про',
		price: '$500',
		tagline: 'Сайт у стилістиці вашого готелю',
		inherits: 'Базовий',
		recommended: true,
		features: [
			'Редизайн під вашу стилістику',
			'Індивідуальні сторінки',
			'Додаткові сторінки',
			'Бронювання на сайті з доступністю номерів та оплатою',
		],
	},
	{
		name: 'Розширений',
		price: '$900',
		tagline: 'Сайт, яким керуєте самі',
		inherits: 'Про',
		features: [
			'Мультимовність',
			'Динамічне створення сторінок',
			'Блог (статті)',
			'Керування галереєю та номерами',
		],
	},
	{
		name: 'Магазин',
		price: '$1500',
		tagline: 'Сайт плюс власний інтернет-магазин',
		inherits: 'Розширений',
		features: [
			'Маркетплейс (магазин) з товарами',
			'Облік продукції',
			'Система оплат з інтеграцією Нової пошти',
		],
	},
];
