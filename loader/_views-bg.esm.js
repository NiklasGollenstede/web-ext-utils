
import Views from './views.esm.js';

if (globalThis.__initView__) {
	globalThis.__initView__.resolve(Views.__initView__);
} else {
	globalThis.__initView__  = Promise.resolve(Views.__initView__);
}

export default Views;
