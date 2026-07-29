/**
 * YourTM Tag Manager - Admin JS
 *
 * Vanilla JavaScript (no jQuery dependency).
 * Handles: Test Connection, Sync Now, connection status indicator.
 */

(function () {
	'use strict';

	/** @type {{ ajaxUrl: string, nonce: string, restUrl: string, restNonce: string, strings: Record<string, string> }} */
	var config = window.yourtmAdmin || {};

	// ---------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------

	/**
	 * Set text and class on an inline message element.
	 *
	 * @param {HTMLElement} el   Target element.
	 * @param {string}      text Message text.
	 * @param {'success'|'error'|'info'} type Message type.
	 */
	function setMessage(el, text, type) {
		if (!el) return;
		el.textContent = text;
		el.className = 'yourtm-message yourtm-message-' + type;
	}

	/** Status name -> dot modifier. Anything unmapped falls back to the neutral dot. */
	var DOT_CLASS = {
		connected: 'yourtm-dot-connected',
		pending: 'yourtm-dot-pending',
		disconnected: 'yourtm-dot-error',
	};

	/**
	 * Update the connection status indicator.
	 *
	 * @param {'connected'|'disconnected'|'pending'|'unknown'} status
	 * @param {string} text
	 */
	function setConnectionStatus(status, text) {
		var wrapper = document.getElementById('yourtm-connection-status');
		if (!wrapper) return;
		var dot = wrapper.querySelector('.yourtm-dot');
		var label = wrapper.querySelector('.yourtm-status-text');
		if (dot) {
			dot.className = 'yourtm-dot ' + (DOT_CLASS[status] || '');
		}
		if (label) {
			label.textContent = text;
		}
	}

	/**
	 * Perform an admin-ajax POST request.
	 *
	 * @param {string}   action   WP AJAX action name.
	 * @param {object}   [data]   Extra form data key/values.
	 * @returns {Promise<{success: boolean, data: object}>}
	 */
	function ajaxPost(action, data) {
		var fd = new FormData();
		fd.append('action', action);
		fd.append('nonce', config.nonce);
		if (data) {
			Object.keys(data).forEach(function (key) {
				fd.append(key, data[key]);
			});
		}
		return fetch(config.ajaxUrl, {
			method: 'POST',
			credentials: 'same-origin',
			body: fd,
		}).then(function (res) {
			return res.json();
		});
	}

	// ---------------------------------------------------------------
	// Test Connection
	// ---------------------------------------------------------------

	function initTestConnection() {
		var btn = document.getElementById('yourtm-test-connection');
		var result = document.getElementById('yourtm-test-result');
		if (!btn) return;

		btn.addEventListener('click', function () {
			btn.disabled = true;
			setMessage(result, config.strings.testing || 'Testing…', 'info');

			ajaxPost('yourtm_test_connection')
				.then(function (res) {
					if (res.success) {
						setMessage(result, config.strings.connected || 'Connected', 'success');
						setConnectionStatus('connected', config.strings.connected || 'Connected');
					} else {
						var msg = (res.data && res.data.message) || 'Unknown error';
						setMessage(result, (config.strings.connectionFailed || 'Failed: ') + msg, 'error');
						setConnectionStatus('disconnected', config.strings.disconnected || 'Disconnected');
					}
				})
				.catch(function (err) {
					setMessage(result, (config.strings.connectionFailed || 'Failed: ') + err.message, 'error');
					setConnectionStatus('disconnected', config.strings.disconnected || 'Disconnected');
				})
				.finally(function () {
					btn.disabled = false;
				});
		});
	}

	// ---------------------------------------------------------------
	// Sync Now
	// ---------------------------------------------------------------

	function initSyncNow() {
		var btn = document.getElementById('yourtm-sync-now');
		var result = document.getElementById('yourtm-sync-result');
		if (!btn) return;

		btn.addEventListener('click', function () {
			btn.disabled = true;
			setMessage(result, config.strings.syncing || 'Syncing…', 'info');

			ajaxPost('yourtm_sync_bundle')
				.then(function (res) {
					if (res.success) {
						setMessage(result, config.strings.syncSuccess || 'Synced!', 'success');

						// Update displayed version and last sync.
						var versionEl = document.getElementById('yourtm-bundle-version');
						if (versionEl && res.data && res.data.version) {
							versionEl.textContent = res.data.version;
						}
						var syncEl = document.getElementById('yourtm-last-sync');
						if (syncEl) {
							syncEl.textContent = new Date().toISOString().replace('T', ' ').substring(0, 19);
						}
					} else {
						var msg = (res.data && res.data.message) || 'Unknown error';
						setMessage(result, (config.strings.syncFailed || 'Failed: ') + msg, 'error');
					}
				})
				.catch(function (err) {
					setMessage(result, (config.strings.syncFailed || 'Failed: ') + err.message, 'error');
				})
				.finally(function () {
					btn.disabled = false;
				});
		});
	}

	// ---------------------------------------------------------------
	// Auto-check connection on page load
	// ---------------------------------------------------------------

	function autoCheckConnection() {
		var containerInput = document.getElementById('yourtm_container_id');

		if (!containerInput || !containerInput.value) {
			setConnectionStatus('unknown', 'Not configured');
			return;
		}

		ajaxPost('yourtm_test_connection')
			.then(function (res) {
				if (res.success) {
					var status = (res.data && res.data.data && res.data.data.status) || 'active';
					if (status === 'active') {
						setConnectionStatus('connected', 'Active — bundle ready');
					} else if (status === 'pending') {
						setConnectionStatus('pending', 'Configured — no bundle synced yet');
					} else {
						setConnectionStatus('connected', config.strings.connected || 'Connected');
					}
				} else {
					var msg = (res.data && res.data.message) || 'No bundle synced';
					setConnectionStatus('disconnected', msg);
				}
			})
			.catch(function () {
				setConnectionStatus('disconnected', config.strings.disconnected || 'Disconnected');
			});
	}

	// ---------------------------------------------------------------
	// Init
	// ---------------------------------------------------------------

	function init() {
		initTestConnection();
		initSyncNow();
		autoCheckConnection();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
