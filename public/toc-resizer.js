// Draggable width for the right-hand table of contents.
// The chosen width is stored in localStorage and applied on every page.
// Double-click the handle (or press Home) to go back to the default width.
(function () {
	var KEY = 'en-toc-width';
	var MIN = 160; // px
	var root = document.documentElement;

	function maxWidth() {
		return Math.max(MIN, Math.round(window.innerWidth * 0.45));
	}

	function clamp(px) {
		return Math.min(Math.max(px, MIN), maxWidth());
	}

	function apply(px) {
		if (px == null) {
			root.style.removeProperty('--en-toc-width');
		} else {
			root.style.setProperty('--en-toc-width', px + 'px');
		}
	}

	function save(px) {
		try {
			if (px == null) localStorage.removeItem(KEY);
			else localStorage.setItem(KEY, String(px));
		} catch (e) {}
	}

	function current() {
		var c = document.querySelector('.right-sidebar-container');
		return c ? Math.round(c.getBoundingClientRect().width) : null;
	}

	function init() {
		var container = document.querySelector('.right-sidebar-container');
		if (!container || container.querySelector('.en-toc-resizer')) return;

		var handle = document.createElement('div');
		handle.className = 'en-toc-resizer';
		handle.setAttribute('role', 'separator');
		handle.setAttribute('aria-orientation', 'vertical');
		handle.setAttribute('aria-label', '목차 폭 조절 (더블클릭하면 기본값)');
		handle.setAttribute('title', '드래그해서 목차 폭 조절, 더블클릭하면 기본값');
		handle.tabIndex = 0;
		container.appendChild(handle);

		var dragging = false;

		handle.addEventListener('pointerdown', function (e) {
			if (e.button !== 0) return;
			dragging = true;
			handle.setPointerCapture(e.pointerId);
			root.classList.add('en-resizing');
			e.preventDefault();
		});

		handle.addEventListener('pointermove', function (e) {
			if (!dragging) return;
			// The TOC sits at the right edge, so its width is the distance from the
			// pointer to the right edge of the page (excluding the scrollbar).
			apply(clamp(root.clientWidth - e.clientX));
		});

		function stop(e) {
			if (!dragging) return;
			dragging = false;
			root.classList.remove('en-resizing');
			try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
			save(current());
		}
		handle.addEventListener('pointerup', stop);
		handle.addEventListener('pointercancel', stop);

		handle.addEventListener('dblclick', function () {
			apply(null);
			save(null);
		});

		handle.addEventListener('keydown', function (e) {
			var w = current();
			if (w == null) return;
			var step = e.shiftKey ? 40 : 10;
			if (e.key === 'ArrowLeft') w += step; // TOC grows to the left
			else if (e.key === 'ArrowRight') w -= step;
			else if (e.key === 'Home') { apply(null); save(null); e.preventDefault(); return; }
			else return;
			e.preventDefault();
			w = clamp(w);
			apply(w);
			save(w);
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
