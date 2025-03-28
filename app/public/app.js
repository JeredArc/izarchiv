// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
	console.log('IZARchiv frontend loaded');
	
	// Initialize collapsible sections
	initCollapsibleSections();

	// Row click navigation
	initRowClickNavigation();

	// Initialize list page functionality (for records, devices, and sources pages)
	initListPageFunctionality();

	initDetailPageFunctionality();
	
	// Prevent phone number auto-detection
	preventPhoneLinks();

	initPageLimitSelector();
});

// Initialize collapsible sections
function initCollapsibleSections() {
	const collapsibles = document.querySelectorAll('.collapsible h3');
	
	collapsibles.forEach(header => {
		header.addEventListener('click', function(e) {
			if (e.target.tagName === 'A') return;

			const section = this.parentElement;
			section.classList.toggle('collapsed');
			
			// Toggle content visibility
			const content = section.querySelector('.collapsible-content');
			if (content) {
				if (section.classList.contains('collapsed')) {
					// Ensure collapsed content is completely hidden
					content.style.maxHeight = '0';
					content.style.overflow = 'hidden';
					content.style.paddingTop = '0';
					content.style.paddingBottom = '0';
				} else {
					// First set a temporary height for the animation
					content.style.maxHeight = 'none';
					const scrollHeight = content.scrollHeight;
					content.style.maxHeight = '0';
					
					// Force a reflow to ensure the animation works
					void content.offsetWidth;
					
					// Now set the height for animation
					content.style.maxHeight = scrollHeight + 'px';
					content.style.paddingTop = '0.8rem';
					content.style.paddingBottom = '0.8rem';
					
					// After animation completes, allow full content display
					setTimeout(() => {
						content.style.maxHeight = 'none';
						content.style.overflow = 'visible';
					}, 300);
				}
			}
		});
	});
	
	// Initialize collapsed sections
	document.querySelectorAll('.collapsible.collapsed').forEach(section => {
		const content = section.querySelector('.collapsible-content');
		if (content) {
			content.style.maxHeight = '0';
			content.style.overflow = 'hidden';
			content.style.paddingTop = '0';
			content.style.paddingBottom = '0';
		}
	});
}

// Set up event listeners
function initRowClickNavigation() {
	// Example: Add click event for table rows to navigate to detail page
	const tableRows = document.querySelectorAll('tbody tr');
	tableRows.forEach(row => {
		if(row.querySelector('tr>td:first-child a')) {
			let mouseDownPos = null;
			row.addEventListener('mousedown', (e) => {
				mouseDownPos = { x: e.clientX, y: e.clientY };
			});
			row.addEventListener('mousemove', (e) => {
				if (mouseDownPos) {
					const moveX = Math.abs(e.clientX - mouseDownPos.x);
					const moveY = Math.abs(e.clientY - mouseDownPos.y);
					if (moveX > 5 || moveY > 5) {
						mouseDownPos = null;
					}
				}
			});
			row.addEventListener('mouseup', (e) => {
				if (mouseDownPos && e.target.tagName !== 'A') {
					const link = row.querySelector('a');
					if (link) {
						window.location.href = link.href;
					}
				}
				mouseDownPos = null;
			});
			row.style.cursor = 'pointer';
		}
	});
}



/* LIST PAGE FUNCTIONALITY */

// Initialize list page functionality (records, devices, sources pages)
function initListPageFunctionality() {
	// Skip if not on a list page
	if (!document.body.classList.contains('list')) {
		return;
	}

	// Overlay panel functionality
	initOverlayPanels();
}

// Initialize overlay panels
function initOverlayPanels() {
	let overlays = {};
	const initOverlay = function(baseId) {
		const button = document.getElementById(`${baseId}-button`);
		const panel = document.getElementById(`${baseId}-panel`);
		if(!button || !panel) return;
		const cancelButton = panel.querySelector(`.panel-actions .cancel`);
		if(!cancelButton) return;

		let overlay = overlays[baseId] = {
			baseId,
			button,
			panel,
			cancelButton,
			setModified: function(modified = true) {
				this.button.classList.toggle('modified', modified);
			},
			resetOverlay: function() {
				panel.innerHTML = initialHtml;
				initOverlay(baseId); /* reinitialize the overlay, as all event listeners are removed when resetting html */
			}
		};

		let initialHtml = panel.innerHTML;

		button.addEventListener('click', function() {
			let top = button.offsetTop + button.offsetHeight + 10;
			panel.style.top = top + 'px';
			panel.style.maxHeight = (window.innerHeight - 10 - top) + 'px';
		
			for(let otherOverlay of Object.values(overlays)) {
				if(otherOverlay.baseId !== baseId) {
					otherOverlay.panel.classList.remove('active');
				}
			}
			panel.classList.add('active');
		});

		// Close panels when clicking cancel buttons
		cancelButton.addEventListener('click', function() {
			panel.classList.remove('active');
			overlay.setModified(false);
			overlay.resetOverlay();
		});

		if(baseId === 'columns') initColumnSelection(overlay);
		if(baseId === 'filter') initFilterFunctionality(overlay);
	};

	for(let baseId of ["columns", "filter"]) initOverlay(baseId);

	if (Object.keys(overlays).length > 0) {
		// Close panels when clicking outside
		document.addEventListener('click', function(e) {
			for(let overlay of Object.values(overlays)) {
				/* also check if e.target is inside document, as it might be the remove filter button, that is already removed from the overlay */
				if(overlay.panel.classList.contains('active') && document.contains(e.target) && !overlay.panel.contains(e.target) && !overlay.button.contains(e.target)) {
					overlay.panel.classList.remove('active');
				}
			}
		});

		// Close panels when hitting escape
		document.addEventListener('keydown', function(e) {
			if (e.key === 'Escape') {
				for(let overlay of Object.values(overlays)) {
					overlay.panel.classList.remove('active');
				}
			}
		});
	}
}


// Initialize column selection functionality
function initColumnSelection(overlay) {
	// Helper function to update column selection
	function updateColumnSelection() {
		const columnsParam = overlay.panel.querySelector('#columns-param');
		if (!columnsParam) return;
		
		const selectedColumns = [];
		const deselectedColumns = [];
		let includesDefaultDeselected = false;
		
		// Collect all checked columns
		overlay.panel.querySelectorAll('.column-checkbox input').forEach(input => {
			const columnName = input.id.replace(/^col-/, '');
			if(input.dataset.defaultDeselected && !input.checked) return;
			if(input.dataset.defaultDeselected) includesDefaultDeselected = true;
			(input.checked ? selectedColumns : deselectedColumns).push(columnName);
		});
		
		// Determine if we should use the "-" prefix approach
		if (!includesDefaultDeselected && deselectedColumns.length === 0) {
			// All columns selected, no need for a parameter
			columnsParam.value = '';
		} else if (!includesDefaultDeselected && deselectedColumns.length < selectedColumns.length) {
			// More columns selected than deselected, use "-" prefix for deselected
			columnsParam.value = '-' + deselectedColumns.join(',');
		} else {
			// Fewer columns selected, just list the selected ones
			columnsParam.value = selectedColumns.join(',');
		}
	}
	
	// Add event listener to the form to update the columns parameter before submission
	const columnsForm = overlay.panel.querySelector('#columns-form');
	if (columnsForm) {
		columnsForm.addEventListener('submit', function(e) {
			updateColumnSelection();
		});
	}

	overlay.panel.querySelectorAll('.column-checkbox input').forEach(input => {
		input.addEventListener('change', function() {
			overlay.setModified();
		});
	});
}

// Initialize filter functionality
function initFilterFunctionality(overlay) {
	const addFilterBtn = overlay.panel.querySelector('#add-filter');
	const filterConditions = overlay.panel.querySelector('#filter-conditions');
	
	if (addFilterBtn && filterConditions) {
		addFilterBtn.addEventListener('click', function() {
			// Clone the first filter condition as a template
			const firstCondition = filterConditions.querySelector('.filter-condition');
			if (!firstCondition) return;
			
			const newCondition = firstCondition.cloneNode(true);
			const newIndex = filterConditions.querySelectorAll('.filter-condition').length;
			
			// Update the index attribute
			newCondition.setAttribute('data-index', newIndex);
			
			// Clear any entered values
			newCondition.querySelector('.filter-value').value = '';
			
			// Add the new condition to the DOM
			filterConditions.appendChild(newCondition);
			
			// Add event listener to the remove button
			const removeBtn = newCondition.querySelector('.remove-filter');
			if (removeBtn) {
				removeBtn.addEventListener('click', function() {
					newCondition.remove();
					overlay.setModified();
				});
			}

			overlay.setModified();
		});
		
		// Add event listeners to existing remove buttons
		overlay.panel.querySelectorAll('.remove-filter').forEach(button => {
			button.addEventListener('click', function() {
				const condition = this.closest('.filter-condition');
				if (condition) {
					condition.remove();
					overlay.setModified();
				}
			});
		});
	}
}



/* DETAIL PAGE FUNCTIONALITY */

function initDetailPageFunctionality() {
	// Skip if not on a detail page
	if (!document.body.classList.contains('detail')) {
		return;
	}

	initBodyPadding();

	// Initialize summary item click navigation
	initSummaryItemClickNavigation();
}

function initBodyPadding() {
	// Set initial padding based on header/footer heights
	const header = document.querySelector('header');
	const footer = document.querySelector('footer');
	const main = document.querySelector('main');
	const adjustPadding = () => {
		main.style.paddingTop = header.offsetHeight + 'px';
		main.style.paddingBottom = footer.offsetHeight + 'px';
	};
	adjustPadding();
	// Update padding when window is resized
	window.addEventListener('resize', adjustPadding);
}

function initSummaryItemClickNavigation() {
	const summaryItems = document.querySelectorAll('.summary-item:has(a)');
	summaryItems.forEach(item => {
		item.addEventListener('click', function() {
			window.location.href = this.querySelector('a').href;
		});
		item.style.cursor = 'pointer';
	});
}

// Prevent phone number auto-detection
function preventPhoneLinks() {
	setTimeout(() => {
		document.querySelectorAll('a[href^="tel"]').forEach(link => {
			link.href = 'javascript:void(0)';
			link.classList.add('no-phone-link');
		});
	}, 100);
}

function initPageLimitSelector() {
	const limitSelector = document.getElementById('limit-select');
	if (limitSelector) {
		limitSelector.addEventListener('change', function() {
			let newUrl = this.value;
			this.selectedIndex = this.getAttribute('data-initial-selected'); /* return to original limit, if user goes back in browser history */
			window.location.href = newUrl;
		});
	}
}