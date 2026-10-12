import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface TocEntry {
	id: string;
	label: string;
}

@Component({
	selector: 'app-privacy',
	imports: [RouterLink],
	templateUrl: './privacy.component.html',
	styleUrl: './privacy.component.scss',
})
export class PrivacyComponent {
	protected readonly lastUpdated = '17 вересня 2026';

	protected readonly toc: TocEntry[] = [
		{ id: 'who', label: 'Хто ми' },
		{ id: 'data', label: 'Які дані ми обробляємо' },
		{ id: 'purpose', label: 'Навіщо ми обробляємо дані' },
		{ id: 'basis', label: 'Правові підстави обробки' },
		{ id: 'sharing', label: 'Кому передаються дані' },
		{ id: 'retention', label: 'Скільки ми зберігаємо дані' },
		{ id: 'rights', label: 'Ваші права' },
		{ id: 'security', label: 'Безпека даних' },
		{ id: 'children', label: 'Діти' },
		{ id: 'transfer', label: 'Міжнародна передача даних' },
		{ id: 'changes', label: 'Зміни цієї Політики' },
		{ id: 'contact', label: 'Контакти' },
	];
}
