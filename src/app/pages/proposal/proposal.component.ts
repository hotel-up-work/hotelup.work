import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { companyEmailHref } from '../../feature/company/company.data';
import { PLAN_ORDER, PLANS } from '../../shared/plan';
import { findProposalHotel } from './proposal-hotels';

interface Card {
	title: string;
	text: string;
}

interface Case {
	title: string;
	situation: string;
	cost: string;
	fix: string;
}

const CASES: Case[] = [
	{
		title: 'Двоє гостей з підтвердженням на один номер',
		situation: 'Дзвінок записали в зошит. Заявку з Instagram підтвердив менеджер. Ще одна прийшла з сайту на пошту.',
		cost: 'Повернення передоплати, номер у сусідів за ваш кошт і поганий відгук.',
		fix: 'Один календар для всієї команди і всіх джерел. Перед підтвердженням видно, чи вільний номер.',
	},
	{
		title: 'Передоплата прийшла. Куди саме, ніхто не знає',
		situation: 'Картка адміністратора, готівка, Viber, зошит, банк.',
		cost: 'Недоотримані залишки, гроші повз касу і невідомий реальний дохід.',
		fix: 'Кожна гривня прив’язана до конкретного бронювання: сума, спосіб, дата і хто прийняв оплату. Усі неоплачені залишки в одному списку.',
	},
	{
		title: 'Світло зникло, а разом із ним і таблиця бронювань',
		situation: 'Ноутбук на рецепції сів. Excel залишився на ньому. Гість питає про суботу і бронює деінде.',
		cost: 'Втрачені бронювання та ризик втратити весь файл.',
		fix: 'Готель у хмарі, рецепція в телефоні. Календар і оплати відкриваються з телефона.',
	},
	{
		title: 'Адміністратор звільнився і забрав базу гостей',
		situation:
			'Контакти постійних гостей у його телефоні, листування у Viber, домовленості у його голові. Новий працівник починає з нуля.',
		cost: 'Постійні гості бронюють там, де їх пам’ятають.',
		fix: 'База гостей належить готелю, а не працівнику. Контакти, історія проживань і нотатки у картці гостя. Кожен працівник має свій вхід і роль. Людина пішла → доступ вимкнули → історія гостя залишилася.',
	},
	{
		title: 'Власник далеко, а готель працює щодня',
		situation:
			'Ви за кордоном, в іншому місті чи просто не на рецепції. Щоб дізнатися про заїзди, завантаження та борги, доводиться дзвонити адміністратору і вірити на слово.',
		cost: 'Рішення без цифр і залежність від однієї людини.',
		fix: 'Увесь день готелю на екрані телефона: заїзди, виїзди, завантаження, борги, хто створив бронювання, хто прийняв оплату.',
	},
];

const CRM_AREAS: Card[] = [
	{ title: 'База гостей', text: 'Контакти та історія' },
	{ title: 'Заявки', text: 'Нова → в роботі → бронювання' },
	{ title: 'Джерела', text: 'Сайт / соцмережі / реклама' },
	{ title: 'Аналітика', text: 'Конверсія та результат' },
];

@Component({
	selector: 'app-proposal',
	imports: [RouterLink],
	templateUrl: './proposal.component.html',
	styleUrl: './proposal.component.scss',
})
export class ProposalComponent {
	private readonly _route = inject(ActivatedRoute);

	/** Hotel from the `:slug` route param; null on the generic /proposal page or for an unknown slug. */
	protected readonly hotel = toSignal(this._route.paramMap.pipe(map((p) => findProposalHotel(p.get('slug')))), {
		initialValue: findProposalHotel(this._route.snapshot.paramMap.get('slug')),
	});
	protected readonly hotelName = computed(() => this.hotel()?.name ?? 'вашого готелю');
	/** The landing page built for this hotel: https://<slug>.hotelup.work. */
	protected readonly siteHost = computed(() => (this.hotel() ? `${this.hotel()!.slug}.hotelup.work` : null));
	protected readonly otaTitle = computed(
		() => `Скільки грошей ${this.hotel()?.name ?? 'ваш готель'} віддає посередникам?`,
	);

	protected readonly emailHref = companyEmailHref;
	protected readonly cases = CASES;
	protected readonly crmAreas = CRM_AREAS;
	protected readonly plans = PLAN_ORDER.map((key) => PLANS[key]);
	protected readonly channels = ['Booking.com', 'Airbnb', 'Expedia', 'Сайт готелю', 'Прямі заявки'];
	protected readonly channelChecks = [
		'Єдиний календар бронювань',
		'Актуальна інформація про доступність номерів',
		'Менше ручної роботи адміністратора',
		'Менший ризик подвійного бронювання',
	];
	protected readonly inbound = ['Instagram DM', 'Телефон', 'Viber / WhatsApp', 'Заявки з сайту', 'OTA'];
}
