import { routeCategories } from '../search/categories';
import { searchProducts } from '../search/products';
import type { Budget } from '../search/query';
import type { SessionState } from './state';

/** Step 1 shared by `search_products` and missions: category routing + product search; updates the session. */
export async function productSearch(state: SessionState, i: { text: string; budget?: Budget; limit?: number }) {
  const route = await routeCategories(i.text, { budget: i.budget });
  const budget = route.budget ?? i.budget;
  const res = await searchProducts({ text: i.text, keywords: route.keywords, categories: route.categories, budget, limit: i.limit ?? 4 });
  state.need = i.text;
  state.categories = route.categories;
  state.candidates = res.products.map((p) => p.product_id);
  state.chosenProduct = undefined;
  if (budget) state.budget = budget;
  return res;
}
