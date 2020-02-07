$(function(){
  $('.testimonials li').each(function(){
    $(this).hide();
  });
  var min = 0;
  var max = $('.testimonials li').length;
  var firstLi = Math.floor(Math.random() * (max - min)) + min;
  var secondLi;
  do { 
    secondLi = Math.floor(Math.random() * (max - min)) + min;  
  } while(secondLi == firstLi);
  
  $('.testimonials li').eq(firstLi).show();
  $('.testimonials li').eq(secondLi).show().addClass('last');
});