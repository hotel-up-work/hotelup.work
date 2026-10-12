import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { getStoredPlan, PLAN_ORDER, PLAN_ROLES, PLANS, setStoredPlan, type Plan } from '../../shared/plan';
import { defaultPageFor, ROLE_LABEL, setDemoRole, type Role } from '../../shared/role';

@Component({
	selector: 'app-demo',
	imports: [RouterLink],
	templateUrl: './demo.component.html',
	styleUrl: './demo.component.scss',
})
export class DemoComponent {
	private readonly _router = inject(Router);

	protected readonly roleLabel = ROLE_LABEL;
	protected readonly plans = PLAN_ORDER.map((key) => PLANS[key]);
	protected readonly demoPlan = signal<Plan>(getStoredPlan());
	protected readonly demoRoles: Role[] = [
		'owner',
		'manager',
		'reception',
		'housekeeping',
		'sales',
		'accountant',
		'maintenance',
	];

	protected setDemoPlan(plan: Plan): void {
		this.demoPlan.set(plan);
		setStoredPlan(plan);
	}

	protected roleOnPlan(role: Role): boolean {
		return PLAN_ROLES[this.demoPlan()].includes(role);
	}

	protected reviewAs(role: Role): void {
		if (!this.roleOnPlan(role)) return;
		setDemoRole(role);
		const home = defaultPageFor(role, this.demoPlan());
		this._router.navigateByUrl('/' + (home ?? ''));
	}
}
