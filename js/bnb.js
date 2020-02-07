
	$(document).ready(function(){

// BACK TO TOP BUTTON

		$("a[href='#top']").click(function() {
		  $("html, body").animate({ scrollTop: 0 }, "fast");
		  return false;
		});

// FLEXSLIDER INIT

			$('.flexslider-1').flexslider({
				controlNav: false,
			});
			$('.flexslider-2').flexslider({
				controlNav: false,
			});
			$('.flexslider-3').flexslider({
				controlNav: false,
			});

// FANCYBOX INIT

			$("a[data-fancy=group1]").fancybox({
				'transitionIn'		: 'none',
				'transitionOut'		: 'none',
				'titlePosition' 	: 'over',
				'titleFormat'		: function(title, currentArray, currentIndex, currentOpts) {
					return '<span id="fancybox-title-over">Image ' + (currentIndex + 1) + ' / ' + currentArray.length + (title.length ? ' &nbsp; ' + title : '') + '</span>';
				}
			});

			$("a[data-fancy=group2]").fancybox({
				'transitionIn'		: 'none',
				'transitionOut'		: 'none',
				'titlePosition' 	: 'over',
				'titleFormat'		: function(title, currentArray, currentIndex, currentOpts) {
					return '<span id="fancybox-title-over">Image ' + (currentIndex + 1) + ' / ' + currentArray.length + (title.length ? ' &nbsp; ' + title : '') + '</span>';
				}
			});

			$("a[data-fancy=group3]").fancybox({
				'transitionIn'		: 'none',
				'transitionOut'		: 'none',
				'titlePosition' 	: 'over',
				'titleFormat'		: function(title, currentArray, currentIndex, currentOpts) {
					return '<span id="fancybox-title-over">Image ' + (currentIndex + 1) + ' / ' + currentArray.length + (title.length ? ' &nbsp; ' + title : '') + '</span>';
				}
			});

// BOOKING FORM VALIDATION

		$(".booking").validate({
			rules: {
				".email": {
					required: true,
					email: true
				},
				".message": {
					required: true
				}
			},
			errorPlacement: function(error, element){
				}
			});

	// END DOCUMENT READY MAIN WRAPPER
	});