import { type PortalView, views } from './catalog';

export function findView(id: string): PortalView | undefined {
	if (Object.hasOwn(views, id)) return views[id as keyof typeof views];
}
