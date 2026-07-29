<?php
/**
 * DataLayer enrichment: output WordPress page context before the bundle loads.
 *
 * @package YourTM_Tag_Manager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class YourTM_DataLayer {

	/**
	 * Output the dataLayer script tag in wp_head (priority 1).
	 */
	public function output_datalayer() {
		/** Allow preventing datalayer output entirely. */
		if ( ! apply_filters( 'yourtm_should_output_datalayer', true ) ) {
			return;
		}

		if ( get_option( 'yourtm_datalayer_enabled', '0' ) !== '1' ) {
			return;
		}

		// Don't output if the bundle itself won't load.
		if ( empty( get_option( 'yourtm_container_id', '' ) ) ) {
			return;
		}

		if ( get_option( 'yourtm_disable_for_admins', '0' ) === '1' && current_user_can( 'manage_options' ) ) {
			return;
		}

		if ( get_option( 'yourtm_disable_on_preview', '1' ) === '1' && is_preview() ) {
			return;
		}

		$enabled_fields = get_option( 'yourtm_datalayer_fields', array( 'page', 'site', 'user', 'ecommerce' ) );
		if ( ! is_array( $enabled_fields ) ) {
			$enabled_fields = array( 'page', 'site', 'user', 'ecommerce' );
		}

		$data = array(
			'event' => 'ytm.pageContext',
		);

		if ( in_array( 'page', $enabled_fields, true ) ) {
			$page_data    = $this->get_page_data();
			/** Sub-filter for page data. */
			$data['page'] = apply_filters( 'yourtm_datalayer_page_data', $page_data );
		}

		if ( in_array( 'site', $enabled_fields, true ) ) {
			$data['site'] = $this->get_site_data();
		}

		if ( in_array( 'user', $enabled_fields, true ) ) {
			$user_data    = $this->get_user_data();
			/** Sub-filter for user data. */
			$data['user'] = apply_filters( 'yourtm_datalayer_user_data', $user_data );
		}

		if ( in_array( 'ecommerce', $enabled_fields, true ) && class_exists( 'WooCommerce' ) ) {
			$ecommerce = $this->get_ecommerce_data();
			if ( ! empty( $ecommerce ) ) {
				/** Sub-filter for ecommerce data. */
				$data['ecommerce'] = apply_filters( 'yourtm_datalayer_ecommerce_data', $ecommerce );
			}
		}

		/** Master filter for all datalayer data. */
		$data = apply_filters( 'yourtm_datalayer_data', $data );

		$json = wp_json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );

		echo "\n<script>\n";
		echo "window.dataLayer = window.dataLayer || [];\n";
		echo 'window.dataLayer.push(' . $json . ");\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- JSON-encoded structured data for JS consumption.
		echo "</script>\n";
	}

	// ------------------------------------------------------------------
	// Page data
	// ------------------------------------------------------------------

	/**
	 * Build page context data from the current WordPress query.
	 *
	 * @return array
	 */
	private function get_page_data() {
		$page = array(
			'type'     => $this->get_page_type(),
			'url'      => $this->get_relative_url(),
			'template' => $this->get_template_name(),
		);

		if ( is_singular() ) {
			global $post;
			if ( $post instanceof WP_Post ) {
				$page['id']            = $post->ID;
				$page['title']         = get_the_title( $post );
				$page['datePublished'] = get_the_date( 'Y-m-d', $post );
				$page['dateModified']  = get_the_modified_date( 'Y-m-d', $post );

				$author = get_the_author_meta( 'display_name', $post->post_author );
				if ( $author ) {
					$page['author'] = $author;
				}

				$categories = $this->get_term_names( $post->ID, 'category' );
				if ( ! empty( $categories ) ) {
					$page['categories'] = $categories;
				}

				$tags = $this->get_term_names( $post->ID, 'post_tag' );
				if ( ! empty( $tags ) ) {
					$page['tags'] = $tags;
				}

				$breadcrumbs = $this->build_breadcrumbs( $post );
				if ( ! empty( $breadcrumbs ) ) {
					$page['breadcrumbs'] = $breadcrumbs;
				}
			}
		}

		if ( is_category() || is_tag() || is_tax() ) {
			$term = get_queried_object();
			if ( $term instanceof WP_Term ) {
				$page['id']    = $term->term_id;
				$page['title'] = $term->name;
			}
		}

		if ( is_search() ) {
			$page['searchQuery'] = get_search_query();
		}

		return $page;
	}

	/**
	 * Determine the page type string.
	 *
	 * @return string
	 */
	private function get_page_type() {
		if ( is_front_page() && is_home() ) {
			return 'home';
		}
		if ( is_front_page() ) {
			return 'home';
		}
		if ( is_home() ) {
			return 'archive';
		}
		if ( is_singular() ) {
			return get_post_type();
		}
		if ( is_category() ) {
			return 'category';
		}
		if ( is_tag() ) {
			return 'tag';
		}
		if ( is_tax() ) {
			return 'taxonomy';
		}
		if ( is_post_type_archive() ) {
			return 'archive';
		}
		if ( is_author() ) {
			return 'author';
		}
		if ( is_date() ) {
			return 'date';
		}
		if ( is_search() ) {
			return 'search';
		}
		if ( is_404() ) {
			return '404';
		}
		return 'other';
	}

	/**
	 * Get the current URL relative to home (fix homepage URL).
	 *
	 * @return string
	 */
	private function get_relative_url() {
		global $wp;

		$path = $wp->request;

		// When $wp->request is empty (homepage), return '/' instead of '//'.
		if ( empty( $path ) ) {
			$relative = '/';
		} else {
			$relative = '/' . ltrim( $path, '/' ) . '/';
		}

		// Include query string when present.
		$query_string = isset( $_SERVER['QUERY_STRING'] ) ? sanitize_text_field( wp_unslash( $_SERVER['QUERY_STRING'] ) ) : '';
		if ( ! empty( $query_string ) ) {
			$relative .= '?' . $query_string;
		}

		return $relative;
	}

	/**
	 * Get the active template file name.
	 *
	 * @return string
	 */
	private function get_template_name() {
		if ( is_singular() ) {
			$template = get_page_template_slug();
			if ( ! empty( $template ) ) {
				return $template;
			}
			return 'single-' . get_post_type();
		}
		if ( is_home() ) {
			return 'home';
		}
		if ( is_archive() ) {
			return 'archive';
		}
		if ( is_search() ) {
			return 'search';
		}
		if ( is_404() ) {
			return '404';
		}
		return 'index';
	}

	/**
	 * Get term names for a post.
	 *
	 * @param int    $post_id  Post ID.
	 * @param string $taxonomy Taxonomy name.
	 * @return array
	 */
	private function get_term_names( $post_id, $taxonomy ) {
		$terms = get_the_terms( $post_id, $taxonomy );
		if ( is_wp_error( $terms ) || empty( $terms ) ) {
			return array();
		}
		return array_map(
			function ( $term ) {
				return $term->name;
			},
			$terms
		);
	}

	/**
	 * Build a simple breadcrumb trail.
	 *
	 * @param WP_Post $post Current post.
	 * @return array
	 */
	private function build_breadcrumbs( $post ) {
		$crumbs = array( get_bloginfo( 'name' ) );

		if ( 'page' === $post->post_type && $post->post_parent ) {
			$ancestors = get_post_ancestors( $post->ID );
			$ancestors = array_reverse( $ancestors );
			foreach ( $ancestors as $ancestor_id ) {
				$crumbs[] = get_the_title( $ancestor_id );
			}
		} elseif ( 'post' === $post->post_type ) {
			$categories = get_the_category( $post->ID );
			if ( ! empty( $categories ) ) {
				$crumbs[] = $categories[0]->name;
			}
		} else {
			$pt_obj = get_post_type_object( $post->post_type );
			if ( $pt_obj && ! empty( $pt_obj->label ) ) {
				$crumbs[] = $pt_obj->label;
			}
		}

		$crumbs[] = get_the_title( $post );

		return $crumbs;
	}

	// ------------------------------------------------------------------
	// Site data
	// ------------------------------------------------------------------

	/**
	 * Build site-level context.
	 *
	 * @return array
	 */
	private function get_site_data() {
		return array(
			'name'        => get_bloginfo( 'name' ),
			'language'    => get_bloginfo( 'language' ),
			'isMultisite' => is_multisite(),
		);
	}

	// ------------------------------------------------------------------
	// User data (never PII)
	// ------------------------------------------------------------------

	/**
	 * Build user context. Only role and hashed ID - never PII.
	 *
	 * @return array
	 */
	private function get_user_data() {
		if ( ! is_user_logged_in() ) {
			return array(
				'loggedIn' => false,
			);
		}

		$user = wp_get_current_user();
		$role = ! empty( $user->roles ) ? $user->roles[0] : '';

		return array(
			'loggedIn' => true,
			'role'     => $role,
			'id'       => hash( 'sha256', (string) $user->ID . wp_salt( 'auth' ) ),
		);
	}

	// ------------------------------------------------------------------
	// WooCommerce e-commerce data
	// ------------------------------------------------------------------

	/**
	 * Build ecommerce data when WooCommerce is active.
	 *
	 * @return array|null
	 */
	private function get_ecommerce_data() {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return null;
		}

		$data = array(
			'currencyCode' => get_woocommerce_currency(),
		);

		// Product page data (view_item).
		if ( is_product() ) {
			global $product;
			if ( ! $product instanceof WC_Product ) {
				$product = wc_get_product( get_the_ID() );
			}

			if ( $product instanceof WC_Product ) {
				$product_data = $this->build_product_data( $product );
				$data['product'] = $product_data;

				// GA4-compatible view_item event.
				$data['event_name'] = 'view_item';
				$data['items']      = array( $product_data );
			}
		}

		// Product archive / category pages (view_item_list).
		if ( is_shop() || is_product_category() || is_product_tag() || is_product_taxonomy() ) {
			global $wp_query;
			$items = array();
			$index = 0;

			if ( ! empty( $wp_query->posts ) ) {
				foreach ( $wp_query->posts as $post_obj ) {
					$list_product = wc_get_product( $post_obj->ID );
					if ( $list_product instanceof WC_Product ) {
						$item          = $this->build_product_data( $list_product );
						$item['index'] = $index;
						$items[]       = $item;
						$index++;
					}
					// Limit to 50 items to avoid excessive data.
					if ( $index >= 50 ) {
						break;
					}
				}
			}

			if ( ! empty( $items ) ) {
				$list_name = 'Shop';
				if ( is_product_category() ) {
					$term = get_queried_object();
					if ( $term instanceof WP_Term ) {
						$list_name = $term->name;
					}
				}

				$data['event_name'] = 'view_item_list';
				$data['item_list_name'] = $list_name;
				$data['items']      = $items;
			}
		}

		// Cart page (view_cart) with items array.
		if ( is_cart() && function_exists( 'WC' ) && WC()->cart ) {
			$cart_items = array();
			foreach ( WC()->cart->get_cart() as $cart_item ) {
				$cart_product = $cart_item['data'];
				if ( $cart_product instanceof WC_Product ) {
					$item             = $this->build_product_data( $cart_product );
					$item['quantity'] = $cart_item['quantity'];
					$cart_items[]     = $item;
				}
			}

			$data['event_name'] = 'view_cart';
			$data['cart'] = array(
				'itemCount' => WC()->cart->get_cart_contents_count(),
				'total'     => (float) WC()->cart->get_cart_contents_total(),
			);
			$data['items'] = $cart_items;
		}

		// Checkout page (begin_checkout).
		if ( is_checkout() && ! is_wc_endpoint_url( 'order-received' ) && function_exists( 'WC' ) && WC()->cart ) {
			$checkout_items = array();
			foreach ( WC()->cart->get_cart() as $cart_item ) {
				$checkout_product = $cart_item['data'];
				if ( $checkout_product instanceof WC_Product ) {
					$item             = $this->build_product_data( $checkout_product );
					$item['quantity'] = $cart_item['quantity'];
					$checkout_items[] = $item;
				}
			}

			$data['event_name'] = 'begin_checkout';
			$data['items']      = $checkout_items;
			$data['value']      = (float) WC()->cart->get_cart_contents_total();
		}

		// Order received / thank-you page (purchase).
		if ( is_checkout() && is_wc_endpoint_url( 'order-received' ) ) {
			global $wp;
			$order_id = isset( $wp->query_vars['order-received'] ) ? absint( $wp->query_vars['order-received'] ) : 0;
			if ( $order_id ) {
				$order = wc_get_order( $order_id );
				if ( $order instanceof WC_Order ) {
					// GA4-compatible items[] array with per-product detail.
					$order_items = array();
					foreach ( $order->get_items() as $order_item ) {
						$order_product = $order_item->get_product();
						if ( $order_product instanceof WC_Product ) {
							$item             = $this->build_product_data( $order_product );
							$item['quantity'] = $order_item->get_quantity();
							$item['price']    = (float) ( $order_item->get_total() / max( 1, $order_item->get_quantity() ) );
							$order_items[]    = $item;
						}
					}

					$data['event_name'] = 'purchase';
					$data['purchase'] = array(
						'transactionId' => $order->get_order_number(),
						'revenue'       => (float) $order->get_total(),
						'tax'           => (float) $order->get_total_tax(),
						'shipping'      => (float) $order->get_shipping_total(),
						'coupon'        => implode( ',', $order->get_coupon_codes() ),
						'itemCount'     => $order->get_item_count(),
					);
					$data['items'] = $order_items;
				}
			}
		}

		return $data;
	}

	/**
	 * Build a GA4-compatible product data array from a WC_Product.
	 * Handles variable products.
	 *
	 * @param WC_Product $product Product object.
	 * @return array
	 */
	private function build_product_data( $product ) {
		$product_data = array(
			'item_id'   => $product->get_sku() ? $product->get_sku() : (string) $product->get_id(),
			'item_name' => $product->get_name(),
		);

		// Handle variable products - output price range or min price.
		if ( $product->is_type( 'variable' ) && $product instanceof WC_Product_Variable ) {
			$min_price = $product->get_variation_price( 'min', true );
			$max_price = $product->get_variation_price( 'max', true );

			$product_data['price'] = (float) $min_price;

			if ( $min_price !== $max_price ) {
				$product_data['price_max'] = (float) $max_price;
			}
		} else {
			$product_data['price'] = (float) $product->get_price();
		}

		$categories = wp_get_post_terms( $product->get_id(), 'product_cat', array( 'fields' => 'names' ) );
		if ( ! is_wp_error( $categories ) && ! empty( $categories ) ) {
			$product_data['item_category'] = $categories[0];
			// Add additional category levels for GA4.
			for ( $i = 1; $i < min( count( $categories ), 5 ); $i++ ) {
				$product_data[ 'item_category' . ( $i + 1 ) ] = $categories[ $i ];
			}
		}

		// Brand: check common brand taxonomy / attribute names.
		$brand = $this->get_product_brand( $product );
		if ( ! empty( $brand ) ) {
			$product_data['item_brand'] = $brand;
		}

		return $product_data;
	}

	/**
	 * Output AJAX add-to-cart tracking script in wp_footer.
	 * Listens to WooCommerce's jQuery 'added_to_cart' event and pushes to dataLayer.
	 */
	public function output_add_to_cart_tracking() {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return;
		}

		if ( get_option( 'yourtm_datalayer_enabled', '0' ) !== '1' ) {
			return;
		}

		if ( empty( get_option( 'yourtm_container_id', '' ) ) ) {
			return;
		}

		$enabled_fields = get_option( 'yourtm_datalayer_fields', array( 'page', 'site', 'user', 'ecommerce' ) );
		if ( ! is_array( $enabled_fields ) || ! in_array( 'ecommerce', $enabled_fields, true ) ) {
			return;
		}

		// Build a product data lookup map from the current page's products.
		$products_map = array();
		if ( function_exists( 'wc_get_product' ) ) {
			global $wp_query;
			if ( $wp_query && ! empty( $wp_query->posts ) ) {
				foreach ( $wp_query->posts as $post_obj ) {
					$product = wc_get_product( $post_obj->ID );
					if ( $product instanceof WC_Product ) {
						$products_map[ $post_obj->ID ] = array(
							'name'  => $product->get_name(),
							'price' => (float) $product->get_price(),
							'sku'   => $product->get_sku(),
						);
					}
				}
			}
		}

		?>
		<script>
		(function() {
			if (typeof jQuery === 'undefined') return;
			var _ytm_products = <?php echo wp_json_encode( $products_map ); ?>;
			jQuery(document.body).on('added_to_cart', function(event, fragments, cart_hash, $button) {
				var productData = {};
				if ($button && $button.length) {
					var pid = $button.data('product_id') || '';
					var info = _ytm_products[pid] || {};
					productData.item_id = info.sku || String(pid);
					productData.item_name = info.name || '';
					productData.price = info.price || 0;
					productData.quantity = parseInt($button.data('quantity'), 10) || 1;
				}
				window.dataLayer = window.dataLayer || [];
				window.dataLayer.push({
					'event': 'add_to_cart',
					'ecommerce': {
						'currencyCode': <?php echo wp_json_encode( get_woocommerce_currency() ); ?>,
						'items': [productData]
					}
				});
			});
		})();
		</script>
		<?php
	}

	/**
	 * Try to get a product brand from common taxonomy / attribute sources.
	 *
	 * @param WC_Product $product Product object.
	 * @return string
	 */
	private function get_product_brand( $product ) {
		// Check common brand taxonomies.
		$brand_taxonomies = array( 'product_brand', 'pa_brand', 'brand' );
		foreach ( $brand_taxonomies as $tax ) {
			if ( taxonomy_exists( $tax ) ) {
				$terms = wp_get_post_terms( $product->get_id(), $tax, array( 'fields' => 'names' ) );
				if ( ! is_wp_error( $terms ) && ! empty( $terms ) ) {
					return $terms[0];
				}
			}
		}

		// Check product attribute.
		$brand = $product->get_attribute( 'brand' );
		if ( ! empty( $brand ) ) {
			return $brand;
		}

		return '';
	}
}
