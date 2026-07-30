import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useOutlet } from 'react-router-dom';
import { pageTransition, pageVariants } from '../motion';

/** Fade/slide page content on route change (from reserve-studio pattern). */
export function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransition}
        style={{ width: '100%' }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
