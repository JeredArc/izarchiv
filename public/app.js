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

/* LIST PAGE FUNCTIONALITY */

// Initialize list page functionality (records, devices, sources pages)
function initListPageFunctionality() {
	// Skip if not on a list page
	if (!document.body.classList.contains('list')) {
		return;
	}

	// Column selection functionality
	initColumnSelection();
	
	// Filter functionality
	initFilterFunctionality();
	
	// Overlay panel functionality
	initOverlayPanels();
}

// Set up event listeners
function initRowClickNavigation() {
	// Example: Add click event for table rows to navigate to detail page
	const tableRows = document.querySelectorAll('tbody tr');
	tableRows.forEach(row => {
		if(row.querySelector('tr>td:first-child>a')) {
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


// Initialize column selection functionality
function initColumnSelection() {
	// Skip if the column selection elements don't exist
	if (!document.getElementById('columns-form')) {
		return;
	}
	
	// Helper function to update column selection
	function updateColumnSelection() {
		const columnsParam = document.getElementById('columns-param');
		if (!columnsParam) return;
		
		const selectedColumns = [];
		const deselectedColumns = [];
		let includesDefaultDeselected = false;
		
		// Collect all checked columns
		document.querySelectorAll('.column-checkbox input').forEach(input => {
			const columnName = input.id.replace('col-', '');
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
	const columnsForm = document.querySelector('#columns-form');
	if (columnsForm) {
		columnsForm.addEventListener('submit', function(e) {
			updateColumnSelection();
		});
	}
}

// Initialize filter functionality
function initFilterFunctionality() {
	// Skip if filter elements don't exist
	if (!document.getElementById('filter-form')) {
		return;
	}
	
	const addFilterBtn = document.getElementById('add-filter');
	const filterConditions = document.getElementById('filter-conditions');
	
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
				});
			}
		});
		
		// Add event listeners to existing remove buttons
		document.querySelectorAll('.remove-filter').forEach(button => {
			button.addEventListener('click', function() {
				const condition = this.closest('.filter-condition');
				if (condition) {
					condition.remove();
				}
			});
		});
	}
}

function alignOverlayPanel(panel, button) {
	let top = button.offsetTop + button.offsetHeight + 10;
	panel.style.top = top + 'px';
	panel.style.maxHeight = (window.innerHeight - 10 - top) + 'px';
}

// Initialize overlay panels
function initOverlayPanels() {
	// Skip if overlay panels don't exist
	if (!document.querySelector('.overlay-panel')) {
		return;
	}
	
	// Column selection panel
	const columnsButton = document.getElementById('columns-button');
	const columnsPanel = document.getElementById('columns-panel');
	
	// Function to restore checkbox states based on current URL parameters
	function restoreCheckboxStatesFromURL() {
		// Skip if elements don't exist
		if (!document.querySelector('.column-checkbox input')) {
			return;
		}
		
		// Get the current columns parameter from the URL
		const urlParams = new URLSearchParams(window.location.search);
		const columnsParam = urlParams.get('columns');
		
		// Default: all checkboxes should be checked unless specified otherwise
		let columnsToShow = [];
		let columnsToHide = [];
		
		if (columnsParam) {
			if (columnsParam.startsWith('-')) {
				// "-" prefix means hide these columns, show all others
				columnsToHide = columnsParam.substring(1).split(',');
			} else {
				// No prefix means show only these columns
				columnsToShow = columnsParam.split(',');
			}
		}
		
		// Update all checkboxes based on the URL parameters
		document.querySelectorAll('.column-checkbox input').forEach(input => {
			const columnName = input.id.replace('col-', '');
			const isDefaultDeselected = input.hasAttribute('data-default-deselected');
			
			if (columnsParam) {
				if (columnsParam.startsWith('-')) {
					// If using "-" prefix, check all except those in columnsToHide
					input.checked = !columnsToHide.includes(columnName);
				} else {
					// Otherwise, only check those in columnsToShow
					input.checked = columnsToShow.includes(columnName);
				}
			} else {
				// No columns parameter: check all except default deselected
				input.checked = !isDefaultDeselected;
			}
		});
	}
	
	if (columnsButton && columnsPanel) {
		columnsButton.addEventListener('click', function() {
			// Restore checkbox states from URL before showing the panel
			restoreCheckboxStatesFromURL();
			
			alignOverlayPanel(columnsPanel, columnsButton);
			columnsPanel.classList.add('active');
			if (filterPanel) filterPanel.classList.remove('active'); // Close other panel
		});
	}
	
	// Filter panel
	const filterButton = document.getElementById('filter-button');
	const filterPanel = document.getElementById('filter-panel');
	
	if (filterButton && filterPanel) {
		filterButton.addEventListener('click', function() {
			alignOverlayPanel(filterPanel, filterButton);
			filterPanel.classList.add('active');
			if (columnsPanel) columnsPanel.classList.remove('active'); // Close other panel
		});
	}
	
	// Close panels when clicking cancel buttons
	document.querySelectorAll('.panel-actions .cancel').forEach(button => {
		button.addEventListener('click', function() {
			// If this is the cancel button in the columns panel, restore checkbox states from URL
			if (button.closest('#columns-panel')) {
				restoreCheckboxStatesFromURL();
			}
			
			if (columnsPanel) columnsPanel.classList.remove('active');
			if (filterPanel) filterPanel.classList.remove('active');
		});
	});
	
	// Close panels when clicking outside
	document.addEventListener('click', function(e) {
		if (columnsPanel && filterPanel && 
			!columnsPanel.contains(e.target) && (!columnsButton || e.target !== columnsButton) && 
			!filterPanel.contains(e.target) && (!filterButton || e.target !== filterButton)) {
			
			// If columns panel is active, restore checkbox states from URL
			if (columnsPanel.classList.contains('active')) {
				restoreCheckboxStatesFromURL();
			}
			
			columnsPanel.classList.remove('active');
			filterPanel.classList.remove('active');
		}
	});
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